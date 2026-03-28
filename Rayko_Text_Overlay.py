import os
import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import cv2
import math
import functools
from typing import Dict, Tuple, List, Optional, Any
from dataclasses import dataclass
import json
import time
import re
import unicodedata
from contextlib import contextmanager
from collections import OrderedDict

try:
    from comfy.utils import ProgressBar as ComfyProgressBar
    HAS_PBAR = True
except ImportError:
    HAS_PBAR = False

def ComfyProgressBar(total: int, desc: str = ""):
    class DummyPBar:
        def update(self, n: int = 1): pass
        def update_absolute(self, n: int): pass
    return DummyPBar()

try:
    import folder_paths
    HAS_FOLDER_PATHS = True
except ImportError:
    HAS_FOLDER_PATHS = False

print("\033[93m🦊\033[0m \033[93mRaykoStudio - RS Text Overlay \033[92mLOADED\033[0m")

class FontNotFoundError(Exception): pass

@dataclass
class TextRenderConfig:
    font: ImageFont.ImageFont
    text_color: Tuple[int, int, int, int]
    outline_color: Tuple[int, int, int, int]
    outline_thickness: int
    letter_spacing: float
    line_spacing: float
    text_orientation: str
    enable_shadow: bool
    shadow_color: Tuple[int, int, int, int]
    shadow_offset: Tuple[int, int]
    shadow_blur: float
    shadow_opacity: float
    text_opacity: int = 100
    use_supersampling: bool = False
    use_edge_smoothing: bool = True
    supersampling_factor: int = 2

    @property
    def has_outline(self) -> bool:
        return self.outline_thickness > 0

    @property
    def has_shadow(self) -> bool:
        return self.enable_shadow

class LRUCache:
    def __init__(self, max_size: int = 100):
        self.cache = OrderedDict()
        self.max_size = max_size
    
    def get(self, key):
        if key not in self.cache:
            return None
        self.cache.move_to_end(key)
        return self.cache[key]
    
    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.max_size:
            self.cache.popitem(last=False)
    
    def clear(self):
        self.cache.clear()
    
    def __len__(self):
        return len(self.cache)

class HighQualityTextRenderer:
    @staticmethod
    def render_with_supersampling(text: str, config: TextRenderConfig, 
                                  container_size: Tuple[int, int], 
                                  render_func, scale_factor: int = 2) -> Image.Image:
        scaled_size = (container_size[0] * scale_factor, container_size[1] * scale_factor)
        
        temp_config = TextRenderConfig(
            font=None,
            text_color=config.text_color,
            outline_color=config.outline_color,
            outline_thickness=config.outline_thickness * scale_factor,
            letter_spacing=config.letter_spacing * scale_factor,
            line_spacing=config.line_spacing,
            text_orientation=config.text_orientation,
            enable_shadow=config.enable_shadow,
            shadow_color=config.shadow_color,
            shadow_offset=(config.shadow_offset[0] * scale_factor, 
                          config.shadow_offset[1] * scale_factor),
            shadow_blur=config.shadow_blur * scale_factor,
            shadow_opacity=config.shadow_opacity,
            text_opacity=config.text_opacity,
            use_supersampling=False,
            use_edge_smoothing=False
        )
        
        try:
            scaled_font_size = int(config.font.size * scale_factor)
            temp_config.font = ImageFont.truetype(
                config.font.path if hasattr(config.font, 'path') else "default", 
                scaled_font_size
            )
        except:
            temp_config.font = config.font
        
        temp_layer = render_func(text, temp_config, scaled_size)
        result = temp_layer.resize(container_size, Image.Resampling.LANCZOS)
        return result
    
    @staticmethod
    def apply_edge_smoothing(text_layer: Image.Image) -> Image.Image:
        arr = np.array(text_layer)
        
        if arr.ndim == 3 and arr.shape[2] == 4:
            alpha = arr[:, :, 3]
            rgb = arr[:, :, :3]
            edges = cv2.Canny(alpha, 50, 150)
            
            if np.any(edges):
                smoothed_rgb = cv2.bilateralFilter(rgb, 5, 50, 50)
                alpha_smoothed = cv2.GaussianBlur(alpha, (3, 3), 0.5)
                edge_mask = edges > 0
                edge_mask_3d = np.stack([edge_mask] * 4, axis=2)
                result_arr = np.dstack([smoothed_rgb, alpha_smoothed])
                original_arr = np.dstack([rgb, alpha])
                result = np.where(edge_mask_3d, result_arr, original_arr)
                return Image.fromarray(result.astype(np.uint8), 'RGBA')
        
        return text_layer

class RS_TextOverlay:
    WEB_DIRECTORY = "web"
    _font_cache: Dict[Tuple[str, int], ImageFont.ImageFont] = {}
    _color_cache: Dict[str, Tuple[int, int, int, int]] = {}
    _text_dim_cache: Dict[Tuple[str, str, float, float, float, int, str], Tuple[float, float, List[float], List[float]]] = {}
    _contour_cache: Dict[int, float] = {}
    _render_cache: LRUCache = None
    
    _hex_color_pattern = re.compile(r'^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})?$')
    _hex_short_pattern = re.compile(r'^#?([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$')

    @classmethod
    def INPUT_TYPES(cls):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        fonts_dir = os.path.join(current_dir, "fonts")
        font_list = ["default"]
        
        if os.path.isdir(fonts_dir):
            for f in sorted(os.listdir(fonts_dir)):
                if f.lower().endswith(('.ttf', '.otf', '.ttc')):
                    font_list.append(f)
        
        return {
            "required": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "node_data": ("STRING", {
                    "default": json.dumps({
                        "text": "Текст",
                        "font_name": "default",
                        "text_color": "#FFFFFF",
                        "outline_thickness": 0,
                        "outline_color": "#808080",
                        "rotate_with_mask": True,
                        "text_opacity": 1.0,
                        "line_spacing": 1.0,
                        "letter_spacing": 0.0,
                        "text_orientation": "horizontal",
                        "enable_shadow": False,
                        "shadow_color": "#333333",
                        "shadow_offset_x": 2,
                        "shadow_offset_y": 2,
                        "shadow_blur": 0.0,
                        "shadow_opacity": 0.8,
                        "font_list": font_list,
                        "use_supersampling": False,
                        "use_edge_smoothing": True,
                        "supersampling_factor": 2
                    }),
                    "hidden": True
                }),
            },
            "optional": {}
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "apply_text"
    CATEGORY = "🦊 RaykoStudio"

    def __init__(self):
        self.debug = False
        self.debug_log = []
        self.quality_renderer = HighQualityTextRenderer()
        
        if self._render_cache is None:
            self.__class__._render_cache = LRUCache(max_size=100)
        
        self.performance_metrics = {
            'render_time': [],
            'font_find_time': [],
            'mask_process_time': [],
            'total_time': []
        }
        
        self._mask_cache = LRUCache(max_size=50)

    def log(self, message: str, level: int = 1):
        if self.debug or level <= 0:
            timestamp = time.strftime("%H:%M:%S")
            prefix = {0: "❌", 1: "ℹ️", 2: "🔍"}.get(level, "•")
            print(f"[{timestamp}] {prefix} RS_TextOverlay: {message}")
            
            if self.debug:
                self.debug_log.append(f"[{timestamp}] {prefix} {message}")
                if len(self.debug_log) > 1000:
                    self.debug_log = self.debug_log[-500:]

    @contextmanager
    def measure_time(self, metric_name: str):
        start = time.perf_counter()
        yield
        elapsed = time.perf_counter() - start
        
        if metric_name in self.performance_metrics:
            self.performance_metrics[metric_name].append(elapsed)
            if len(self.performance_metrics[metric_name]) > 100:
                self.performance_metrics[metric_name] = self.performance_metrics[metric_name][-50:]

    def _validate_inputs(self, image: torch.Tensor, mask: torch.Tensor) -> bool:
        if image is None or mask is None:
            self.log("Image or mask is None", level=0)
            return False
        
        if image.numel() == 0 or mask.numel() == 0:
            self.log("Empty tensor", level=0)
            return False
        
        if image.ndim not in [3, 4]:
            self.log(f"Invalid image dimensions: {image.ndim}", level=0)
            return False
        
        if mask.ndim not in [2, 3, 4]:
            self.log(f"Invalid mask dimensions: {mask.ndim}", level=0)
            return False
        
        if torch.isnan(image).any() or torch.isinf(image).any():
            self.log("Image contains NaN or Inf values", level=0)
            return False
        
        return True

    def _validate_text(self, text: str) -> str:
        if not isinstance(text, str):
            return "Текст"
        
        if not text.strip():
            return "Текст"
        
        text = unicodedata.normalize('NFKC', text)
        text = ''.join(char for char in text if char.isprintable() or char == '\n')
        
        max_length = 1000
        if len(text) > max_length:
            text = text[:max_length] + "..."
            self.log(f"Text truncated to {max_length} characters", level=1)
        
        return text

    def _parse_and_validate_node_data(self, node_data: str) -> dict:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        fonts_dir = os.path.join(current_dir, "fonts")
        font_list = ["default"]
        
        if os.path.isdir(fonts_dir):
            for f in sorted(os.listdir(fonts_dir)):
                if f.lower().endswith(('.ttf', '.otf', '.ttc')):
                    font_list.append(f)
        
        defaults = {
            'text': 'Текст',
            'font_name': 'default',
            'text_color': '#FFFFFF',
            'outline_thickness': 0,
            'outline_color': '#808080',
            'rotate_with_mask': True,
            'text_opacity': 1.0,
            'line_spacing': 1.0,
            'letter_spacing': 0.0,
            'text_orientation': 'horizontal',
            'enable_shadow': False,
            'shadow_color': '#333333',
            'shadow_offset_x': 2,
            'shadow_offset_y': 2,
            'shadow_blur': 0.0,
            'shadow_opacity': 0.8,
            'font_list': font_list,
            'use_supersampling': False,
            'use_edge_smoothing': True,
            'supersampling_factor': 2,
            'min_font_size': 8,
            'max_font_size': 500,
            'padding': 5
        }
        
        if not node_data:
            return defaults
        
        try:
            data = json.loads(node_data)
            
            data['text'] = self._validate_text(data.get('text', defaults['text']))
            data['outline_thickness'] = max(0, min(50, data.get('outline_thickness', 0)))
            data['text_opacity'] = max(0.0, min(1.0, data.get('text_opacity', 1.0)))
            data['line_spacing'] = max(0.5, min(3.0, data.get('line_spacing', 1.0)))
            data['letter_spacing'] = max(-20.0, min(100.0, data.get('letter_spacing', 0.0)))
            data['shadow_blur'] = max(0.0, min(1.0, data.get('shadow_blur', 0.0)))
            data['shadow_opacity'] = max(0.0, min(1.0, data.get('shadow_opacity', 0.8)))
            data['shadow_offset_x'] = max(-50, min(50, data.get('shadow_offset_x', 2)))
            data['shadow_offset_y'] = max(-50, min(50, data.get('shadow_offset_y', 2)))
            data['supersampling_factor'] = max(2, min(4, data.get('supersampling_factor', 2)))
            data['min_font_size'] = max(1, min(100, data.get('min_font_size', 8)))
            data['max_font_size'] = max(data['min_font_size'], min(1000, data.get('max_font_size', 500)))
            data['font_list'] = font_list
            
            return {**defaults, **data}
            
        except json.JSONDecodeError as e:
            self.log(f"Error parsing node_data: {e}", level=0)
            return defaults
        except Exception as e:
            self.log(f"Error validating node_data: {e}", level=0)
            return defaults

    def _is_simple_rectangle(self, mask: np.ndarray) -> bool:
        try:
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                return False
            
            contour = max(contours, key=cv2.contourArea)
            epsilon = 0.02 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            if len(approx) == 4:
                area_contour = cv2.contourArea(contour)
                area_approx = cv2.contourArea(approx)
                return area_approx > 0.9 * area_contour
            
            return False
            
        except Exception as e:
            self.log(f"Error checking rectangle: {e}", level=2)
            return False

    def get_font_path(self, font_name: str) -> Optional[str]:
        if font_name == "default":
            current_dir = os.path.dirname(os.path.abspath(__file__))
            default_path = os.path.join(current_dir, "fonts", "Arial.ttf")
            if os.path.isfile(default_path):
                return default_path
            return None
        
        current_dir = os.path.dirname(os.path.abspath(__file__))
        local_path = os.path.join(current_dir, "fonts", font_name)
        if os.path.isfile(local_path):
            return local_path
        
        return None

    @functools.lru_cache(maxsize=32)
    def get_cached_font(self, font_path: str, size: int) -> ImageFont.ImageFont:
        cache_key = (font_path, size)
        if cache_key in self._font_cache:
            return self._font_cache[cache_key]
        try:
            font = ImageFont.truetype(font_path, size, layout_engine=ImageFont.Layout.BASIC)
            font.path = font_path
            font.size = size
            self._font_cache[cache_key] = font
            return font
        except Exception as e:
            raise FontNotFoundError(f"Font error: {e}")

    def parse_color(self, color: Any, alpha: float = 1.0) -> Tuple[int, int, int, int]:
        if color is None:
            return (255, 255, 255, int(alpha * 255))
        
        cache_key = (str(color), alpha)
        if cache_key in self._color_cache:
            return self._color_cache[cache_key]
        
        try:
            if isinstance(color, str):
                color_str = color.strip()
                
                match = self._hex_color_pattern.match(color_str)
                if match:
                    r, g, b = int(match.group(1), 16), int(match.group(2), 16), int(match.group(3), 16)
                    a = int(match.group(4), 16) if match.group(4) else int(alpha * 255)
                    result = (r, g, b, a)
                else:
                    match_short = self._hex_short_pattern.match(color_str)
                    if match_short:
                        r, g, b = int(match_short.group(1)*2, 16), int(match_short.group(2)*2, 16), int(match_short.group(3)*2, 16)
                        a = int(alpha * 255)
                        result = (r, g, b, a)
                    else:
                        result = (255, 255, 255, int(alpha * 255))
            else:
                result = (255, 255, 255, int(alpha * 255))
            
            self._color_cache[cache_key] = result
            return result
            
        except Exception as e:
            self.log(f"Error parsing color {color}: {e}", level=2)
            return (255, 255, 255, int(alpha * 255))

    @functools.lru_cache(maxsize=64)
    def calculate_text_dimensions(self, font_key: str, text: str, letter_spacing: float,
                                  line_spacing: float, outline_thickness: int,
                                  text_orientation: str) -> Tuple[float, float, List[float], List[float]]:
        cache_key = (font_key, text, letter_spacing, line_spacing, outline_thickness, text_orientation)
        if cache_key in self._text_dim_cache:
            return self._text_dim_cache[cache_key]
        
        temp_img = Image.new("RGB", (1, 1))
        draw = ImageDraw.Draw(temp_img)
        
        font_path, size_str = font_key.rsplit(':', 1) if ':' in font_key else (font_key, '12')
        try:
            font = self.get_cached_font(font_path, int(size_str)) if font_path != "default" else ImageFont.load_default()
        except:
            font = ImageFont.load_default()
        
        lines = text.split('\n') if text_orientation == "horizontal" else [text.replace('\n', '')]
        line_heights, line_widths = [], []
        
        for line in lines:
            line = line.replace('\t', '    ')
            if not line:
                line_heights.append(0)
                line_widths.append(0)
                continue
                
            if text_orientation == "horizontal":
                bbox = draw.textbbox((0, 0), line, font=font)
                line_width = draw.textlength(line, font=font) + letter_spacing * max(0, len(line) - 1)
                line_height = (bbox[3] - bbox[1]) * line_spacing
            else:
                if line:
                    char_bbox = draw.textbbox((0, 0), line[0], font=font)
                    line_width = draw.textlength(line[0], font=font)
                    line_height = (char_bbox[3] - char_bbox[1] + letter_spacing) * len(line)
                else:
                    line_width = line_height = 0
                    
            line_heights.append(line_height + outline_thickness * 2)
            line_widths.append(line_width + outline_thickness * 2)
            
        result = (sum(line_heights), max(line_widths) if line_widths else 0, line_heights, line_widths)
        self._text_dim_cache[cache_key] = result
        return result

    def text_fits(self, font_key: str, text: str, max_width: float, max_height: float,
                  letter_spacing: float, line_spacing: float, outline_thickness: int,
                  text_orientation: str) -> bool:
        total_height, max_line_width, _, _ = self.calculate_text_dimensions(
            font_key, text, letter_spacing, line_spacing, outline_thickness, text_orientation
        )
        return max_line_width <= max_width and total_height <= max_height

    def find_optimal_font_size(self, font_path: Optional[str], text: str,
                               max_width: float, max_height: float,
                               min_size: int, max_size: int, config: TextRenderConfig,
                               pbar: Optional[Any] = None) -> Tuple[ImageFont.ImageFont, int]:
        
        def font_key(size):
            return f"{font_path or 'default'}:{size}"
        
        if self.text_fits(font_key(max_size), text, max_width, max_height,
                         config.letter_spacing, config.line_spacing,
                         config.outline_thickness, config.text_orientation):
            try:
                font = self.get_cached_font(font_path, max_size) if font_path else ImageFont.load_default()
                if font_path and hasattr(font, 'path'):
                    font.path = font_path
                    font.size = max_size
                return font, max_size
            except:
                pass
        
        low, high = min_size, max_size
        best_size, best_font = min_size, None
        
        iterations = 0
        max_iterations = 50
        
        while low <= high and iterations < max_iterations:
            mid = (low + high) // 2
            iterations += 1
            
            if pbar:
                pbar.update(1)
                
            try:
                font = self.get_cached_font(font_path, mid) if font_path else ImageFont.load_default()
            except:
                high = mid - 1
                continue
                
            if self.text_fits(font_key(mid), text, max_width, max_height,
                             config.letter_spacing, config.line_spacing,
                             config.outline_thickness, config.text_orientation):
                best_font, best_size = font, mid
                low = mid + 1
            else:
                high = mid - 1
                
        if best_font is None:
            try:
                best_font = self.get_cached_font(font_path, min_size) if font_path else ImageFont.load_default()
                if font_path and hasattr(best_font, 'path'):
                    best_font.path = font_path
                    best_font.size = min_size
            except:
                best_font = ImageFont.load_default()
                
        return best_font, best_size

    def _prepare_mask_for_opencv(self, mask_tensor: torch.Tensor) -> np.ndarray:
        mask_hash = hash(mask_tensor.cpu().numpy().tobytes())
        
        cached = self._mask_cache.get(mask_hash)
        if cached is not None:
            return cached
        
        mask_np = mask_tensor.cpu().numpy()
        
        if mask_np.ndim == 3:
            if mask_np.shape[0] in [1, 3, 4]:
                mask_np = mask_np[0]
            elif mask_np.shape[-1] in [1, 3, 4]:
                mask_np = mask_np[:, :, 0]
        elif mask_np.ndim == 4:
            mask_np = mask_np[0]
            if mask_np.ndim == 3:
                if mask_np.shape[0] in [1, 3, 4]:
                    mask_np = mask_np[0]
                elif mask_np.shape[-1] in [1, 3, 4]:
                    mask_np = mask_np[:, :, 0]
                    
        if mask_np.dtype in [np.float32, np.float64]:
            mask_np = (mask_np * 255).astype(np.uint8)
        elif mask_np.dtype != np.uint8:
            mask_np = mask_np.astype(np.uint8)
            
        if mask_np.ndim != 2:
            mask_np = mask_np.squeeze()
            
        _, mask_np = cv2.threshold(mask_np, 127, 255, cv2.THRESH_BINARY)
        
        self._mask_cache.put(mask_hash, mask_np)
        return mask_np

    def calculate_mask_rotation(self, mask_np: np.ndarray) -> float:
        mask_hash = hash(mask_np.tobytes())
        
        if mask_hash in self._contour_cache:
            return self._contour_cache[mask_hash]
        
        try:
            contours, _ = cv2.findContours(mask_np, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                return 0.0
                
            contour = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(contour)
            
            if area < 10:
                return 0.0
            
            rect = cv2.minAreaRect(contour)
            angle = rect[2]
            
            if angle < -45:
                angle += 90
            elif angle > 45:
                angle -= 90
                
            result = -angle
            self._contour_cache[mask_hash] = result
            return result
            
        except Exception as e:
            self.log(f"Error calculating mask rotation: {e}", level=2)
            return 0.0

    # ✅ ИСПРАВЛЕННАЯ ФУНКЦИЯ — обводка с letter_spacing
    def _draw_single_line(self, draw, position, text, font, color, letter_spacing, text_orientation):
        x, y = position
        
        if text_orientation == "horizontal":
            current_x = x
            for char in text:
                draw.text((current_x, y), char, font=font, fill=color)
                current_x += draw.textlength(char, font=font) + letter_spacing
        else:
            current_y = y
            for char in text:
                draw.text((x, current_y), char, font=font, fill=color)
                bbox = draw.textbbox((x, current_y), char, font=font)
                current_y += (bbox[3] - bbox[1]) + letter_spacing

    # ✅ ИСПРАВЛЕННАЯ ФУНКЦИЯ — обводка рисуется для КАЖДОЙ буквы с letter_spacing
    def _draw_outline_optimized(self, draw, position, text, font, color, thickness, letter_spacing, text_orientation):
        x, y = position
        
        if text_orientation == "horizontal":
            current_x = x
            for char in text:
                # Рисуем обводку для каждой буквы
                if thickness == 1:
                    directions = [(-1,-1), (-1,0), (-1,1), (0,-1), (0,1), (1,-1), (1,0), (1,1)]
                    for dx, dy in directions:
                        draw.text((current_x + dx, y + dy), char, font=font, fill=color)
                else:
                    for radius in range(1, thickness + 1):
                        for angle in range(0, 360, 45):
                            dx = int(radius * math.cos(math.radians(angle)))
                            dy = int(radius * math.sin(math.radians(angle)))
                            draw.text((current_x + dx, y + dy), char, font=font, fill=color)
                
                # ✅ Применяем letter_spacing к обводке
                current_x += draw.textlength(char, font=font) + letter_spacing
        else:
            current_y = y
            for char in text:
                # Рисуем обводку для каждой буквы
                if thickness == 1:
                    directions = [(-1,-1), (-1,0), (-1,1), (0,-1), (0,1), (1,-1), (1,0), (1,1)]
                    for dx, dy in directions:
                        draw.text((x + dx, current_y + dy), char, font=font, fill=color)
                else:
                    for radius in range(1, thickness + 1):
                        for angle in range(0, 360, 45):
                            dx = int(radius * math.cos(math.radians(angle)))
                            dy = int(radius * math.sin(math.radians(angle)))
                            draw.text((x + dx, current_y + dy), char, font=font, fill=color)
                
                bbox = draw.textbbox((x, current_y), char, font=font)
                current_y += (bbox[3] - bbox[1]) + letter_spacing

    def _render_text_core(self, text: str, config: TextRenderConfig, 
                         container_size: Tuple[int, int]) -> Image.Image:
        text_layer = Image.new("RGBA", container_size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(text_layer)
        
        total_h, max_w, line_heights, line_widths = self.calculate_text_dimensions(
            f"{config.font.path if hasattr(config.font, 'path') else 'default'}:{config.font.size}",
            text, config.letter_spacing, config.line_spacing,
            config.outline_thickness, config.text_orientation
        )
        
        start_y = (container_size[1] - total_h) // 2
        current_y = start_y
        lines = text.split('\n') if config.text_orientation == "horizontal" else [text.replace('\n', '')]
        
        for line, line_w, line_h in zip(lines, line_widths, line_heights):
            if not line.strip():
                current_y += line_h
                continue
                
            start_x = (container_size[0] - line_w) // 2
            
            # ✅ ИСПРАВЛЕНИЕ: передаём letter_spacing в обводку
            if config.has_outline:
                self._draw_outline_optimized(draw, (start_x, current_y), line, config.font,
                                             config.outline_color, config.outline_thickness,
                                             config.letter_spacing, config.text_orientation)
            
            self._draw_single_line(draw, (start_x, current_y), line, config.font,
                                  config.text_color, config.letter_spacing, config.text_orientation)
            
            current_y += line_h
        
        return text_layer

    def render_text_layer(self, text: str, config: TextRenderConfig, 
                         container_size: Tuple[int, int]) -> Image.Image:
        cache_key = f"{text}_{id(config)}_{container_size}_{config.font.size}"
        
        cached = self._render_cache.get(cache_key)
        if cached is not None:
            return cached
        
        text_layer = self._render_text_core(text, config, container_size)
        
        # Сначала supersampling
        if config.use_supersampling and config.supersampling_factor > 1:
            text_layer = self.quality_renderer.render_with_supersampling(
                text, config, container_size, self._render_text_core, config.supersampling_factor
            )
        
        # ПОТОМ тень (после масштабирования!)
        if config.has_shadow:
            text_layer = self._apply_shadow_effect(text_layer, config)
        
        if config.use_edge_smoothing:
            text_layer = self.quality_renderer.apply_edge_smoothing(text_layer)
        
        self._render_cache.put(cache_key, text_layer)
        return text_layer

    def _apply_shadow_effect(self, text_layer: Image.Image, config: TextRenderConfig) -> Image.Image:
        # Получаем альфа-канал текста (форма букв)
        alpha = text_layer.getchannel("A")
        
        # Создаём тень с альфа-каналом текста
        shadow = Image.new("RGBA", text_layer.size, (0, 0, 0, 0))
        shadow.putalpha(alpha.copy())
        
        # Применяем размытие если нужно
        if config.shadow_blur > 0:
            blur_radius = int(config.shadow_blur * 20)
            if blur_radius > 0:
                shadow = shadow.filter(ImageFilter.GaussianBlur(blur_radius))
        
        # Смещаем тень
        offset_x, offset_y = config.shadow_offset
        shadow = shadow.transform(shadow.size, Image.AFFINE, (1, 0, offset_x, 0, 1, offset_y), 
                                 Image.Resampling.BICUBIC, fill=(0, 0, 0, 0))
        
        # Применяем цвет и opacity тени
        shadow_data = np.array(shadow)
        mask = shadow_data[:, :, 3] > 0
        
        # Применяем shadow_opacity к альфа-каналу
        shadow_data[:, :, 3] = (shadow_data[:, :, 3].astype(np.float32) * config.shadow_opacity).astype(np.uint8)
        
        # Создаём цвет тени (RGB без alpha)
        shadow_rgb = np.array([
            config.shadow_color[0],
            config.shadow_color[1],
            config.shadow_color[2]
        ], dtype=np.uint8)
        
        # Применяем цвет только к пикселям где есть тень
        shadow_data[mask, :3] = shadow_rgb
        
        shadow_colored = Image.fromarray(shadow_data, 'RGBA')
        
        # Композит: сначала тень, потом текст
        result = Image.new("RGBA", text_layer.size, (0, 0, 0, 0))
        result.paste(shadow_colored, (0, 0), shadow_colored)
        result.paste(text_layer, (0, 0), text_layer)
        
        return result

    def _process_single(self, image, mask, text, font_name, config, padding, 
                        vertical_align, horizontal_align, rotate_with_mask, 
                        min_font_size, max_font_size):
        
        with self.measure_time('mask_process_time'):
            image_np = (image.cpu().numpy() * 255).astype(np.uint8)
            image_pil = Image.fromarray(image_np, 'RGB') if image_np.ndim == 3 else Image.fromarray(image_np[0], 'RGB')
            mask_np = self._prepare_mask_for_opencv(mask)
            mask_pil = Image.fromarray(mask_np, 'L')
            
        bbox = mask_pil.getbbox()
        if not bbox:
            return image
            
        x1, y1, x2, y2 = bbox
        available_w = max(1, x2 - x1 - 2 * padding)
        available_h = max(1, y2 - y1 - 2 * padding)
        
        font_path = self.get_font_path(font_name)
        
        if font_path is None:
            self.log(f"Font not found: {font_name}, using default", level=0)
            font_path = self.get_font_path("default")
        
        pbar = ComfyProgressBar(max_font_size - min_font_size, "Finding font size") if HAS_PBAR else None
        
        with self.measure_time('font_find_time'):
            config.font, actual_size = self.find_optimal_font_size(
                font_path, text, available_w, available_h, 
                min_font_size, max_font_size, config, pbar
            )
        
        with self.measure_time('render_time'):
            angle = self.calculate_mask_rotation(mask_np) if rotate_with_mask else 0
            diag = math.sqrt(available_w**2 + available_h**2)
            temp_size = int(diag * 1.2) + 50
            text_layer = self.render_text_layer(text, config, (temp_size, temp_size))
            
            if rotate_with_mask and abs(angle) > 0.1:
                text_layer = text_layer.rotate(angle, center=(temp_size//2, temp_size//2), 
                                              resample=Image.Resampling.BICUBIC, expand=False)
                                              
            rot_bbox = text_layer.getbbox()
            if not rot_bbox:
                return image
                
            rx1, ry1, rx2, ry2 = rot_bbox
            text_w, text_h = rx2 - rx1, ry2 - ry1
            
            if rotate_with_mask:
                paste_x = int((x1 + x2 - text_w) / 2)
                paste_y = int((y1 + y2 - text_h) / 2)
            else:
                paste_x = {'left': x1 + padding, 'right': x2 - text_w - padding, 
                          'center': int(x1 + (available_w - text_w) / 2 + padding)}[horizontal_align]
                paste_y = {'top': y1 + padding, 'bottom': y2 - text_h - padding, 
                          'center': int(y1 + (available_h - text_h) / 2 + padding)}[vertical_align]
                          
            cropped = text_layer.crop(rot_bbox)
            image_rgba = image_pil.convert("RGBA")
            overlay = Image.new("RGBA", image_rgba.size, (0, 0, 0, 0))
            overlay.paste(cropped, (paste_x, paste_y), cropped)
            result = Image.alpha_composite(image_rgba, overlay)
            
        result_np = np.array(result.convert("RGB")).astype(np.float32) / 255.0
        return torch.from_numpy(result_np).unsqueeze(0)

    def apply_text(self, image: torch.Tensor, mask: torch.Tensor, node_data: str = None, **kwargs) -> Tuple[torch.Tensor]:
        with self.measure_time('total_time'):
            try:
                if not self._validate_inputs(image, mask):
                    self.log("Input validation failed", level=0)
                    return (image,)
                
                data = self._parse_and_validate_node_data(node_data)
                
                text = data.get('text', 'Текст')
                if not text or not text.strip():
                    self.log("Empty text, using default", level=1)
                    text = "Текст"
                
                font_name = data.get('font_name', 'default')
                
                self.log(f"Rendering text: '{text[:50]}' | Font: {font_name}", level=2)
                
                text_color = data.get('text_color', '#FFFFFF')
                outline_thickness = data.get('outline_thickness', 0)
                outline_color = data.get('outline_color', '#808080')
                rotate_with_mask = data.get('rotate_with_mask', True)
                text_opacity = data.get('text_opacity', 1.0)
                line_spacing = data.get('line_spacing', 1.0)
                letter_spacing = data.get('letter_spacing', 0.0)
                text_orientation = data.get('text_orientation', 'horizontal')
                enable_shadow = data.get('enable_shadow', False)
                shadow_color = data.get('shadow_color', '#333333')
                shadow_offset_x = data.get('shadow_offset_x', 2)
                shadow_offset_y = data.get('shadow_offset_y', 2)
                shadow_blur = data.get('shadow_blur', 0.0)
                shadow_opacity = data.get('shadow_opacity', 0.8)
                use_supersampling = data.get('use_supersampling', False)
                use_edge_smoothing = data.get('use_edge_smoothing', True)
                supersampling_factor = data.get('supersampling_factor', 2)
                min_font_size = data.get('min_font_size', 8)
                max_font_size = data.get('max_font_size', 500)
                padding = data.get('padding', 5)
                
                self.log(f"Shadow settings: enable={enable_shadow}, color={shadow_color}, offset=({shadow_offset_x}, {shadow_offset_y}), blur={shadow_blur}, opacity={shadow_opacity}", level=1)
                
                config = TextRenderConfig(
                    font=None,
                    text_color=self.parse_color(text_color, text_opacity),
                    outline_color=self.parse_color(outline_color, text_opacity),
                    outline_thickness=outline_thickness,
                    letter_spacing=letter_spacing,
                    line_spacing=line_spacing,
                    text_orientation=text_orientation,
                    enable_shadow=enable_shadow,
                    shadow_color=self.parse_color(shadow_color, 1.0),
                    shadow_offset=(shadow_offset_x, shadow_offset_y),
                    shadow_blur=shadow_blur,
                    shadow_opacity=shadow_opacity,
                    text_opacity=int(text_opacity * 100),
                    use_supersampling=use_supersampling,
                    use_edge_smoothing=use_edge_smoothing,
                    supersampling_factor=supersampling_factor
                )
                
                if image.ndim == 4:
                    results = []
                    for i in range(image.shape[0]):
                        result = self._process_single(
                            image[i], mask[i] if mask.ndim == 4 else mask, 
                            text, font_name, config, padding, 'center', 'center', 
                            rotate_with_mask, min_font_size, max_font_size
                        )
                        results.append(result)
                    result_tensor = torch.cat(results, dim=0)
                else:
                    result_tensor = self._process_single(
                        image, mask, text, font_name, config, padding,
                        'center', 'center', rotate_with_mask, min_font_size, max_font_size
                    )
                
                return (result_tensor,)
                
            except Exception as e:
                self.log(f"Error in apply_text: {type(e).__name__}: {e}", level=0)
                import traceback
                traceback.print_exc()
                return (image,)

    def __del__(self):
        self._font_cache.clear()
        self._color_cache.clear()
        self._text_dim_cache.clear()
        self._contour_cache.clear()
        if self._render_cache:
            self._render_cache.clear()
        if hasattr(self, '_mask_cache'):
            self._mask_cache.clear()
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

NODE_CLASS_MAPPINGS = {"RS_TextOverlay": RS_TextOverlay}
NODE_DISPLAY_NAME_MAPPINGS = {"RS_TextOverlay": "🦊 RS Text Overlay"}
__all__ = ["RS_TextOverlay", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]