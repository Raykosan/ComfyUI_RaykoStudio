"""
🦊 RaykoStudio - RS Text Overlay v3.10
======================================
Наложение текста на изображение с привязкой к маске.

v3.10 fix:
• 🛠 Исправлена ошибка OpenCV в calculate_mask_rotation
• 🛠 Правильная конвертация маски (torch → numpy → CV_8UC1)
• 🎨 COLOR тип + JavaScript UI (550px ширина)
• 🎚️ shadow_blur: FLOAT (0.0-1.0, step 0.05)
• ❌ Убран blend_mode (всегда normal)

Структура файлов:
    custom_nodes/ComfyUI_RaykoStudio/
    ├── Rayko_Text_Overlay.py      ← этот файл
    ├── web/
    │   └── extensions/
    │       └── rs_text_overlay.js ← JavaScript UI (550px)
    └── fonts/                     ← папка со шрифтами

Автор: RaykoStudio
Лицензия: MIT
"""

import os
import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import cv2
import math
import functools
from typing import Dict, Tuple, List, Optional, Any
from dataclasses import dataclass
import re

try:
    from comfy.utils import ProgressBar as ComfyProgressBar
    HAS_PBAR = True
except ImportError:
    HAS_PBAR = False
    def ComfyProgressBar(total: int, desc: str = ""):
        class DummyPBar:
            def update(self, n: int = 1): pass
        return DummyPBar()

try:
    import folder_paths
    HAS_FOLDER_PATHS = True
except ImportError:
    HAS_FOLDER_PATHS = False

print("\033[93m🦊\033[0m \033[93mRaykoStudio - RS Text Overlay \033[92mv3.10 LOADED\033[0m")


class FontNotFoundError(Exception): pass
class ColorParseError(Exception): pass


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
    text_opacity: int = 100
    
    @property
    def has_outline(self) -> bool:
        return self.outline_thickness > 0
    
    @property
    def has_shadow(self) -> bool:
        return self.enable_shadow and any(self.shadow_offset)


class RS_TextOverlay:
    _font_cache: Dict[Tuple[str, int], ImageFont.ImageFont] = {}
    _color_cache: Dict[str, Tuple[int, int, int, int]] = {}
    _text_dim_cache: Dict[Tuple[str, str, float, float, float, int, str], Tuple[float, float, List[float], List[float]]] = {}
    _contour_cache: Dict[int, float] = {}
    
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
                "text": ("STRING", {
                    "default": "Текст\nс переносом",
                    "multiline": True,
                    "tooltip": "Текст для отображения"
                }),
                "font_name": (font_list, {
                    "default": font_list[0] if len(font_list) > 1 else "default",
                    "tooltip": "Шрифт из папки fonts/"
                }),
                "text_color": ("COLOR", {
                    "default": [1.0, 1.0, 1.0, 1.0],
                    "tooltip": "Цвет текста"
                }),
                "outline_thickness": ("INT", {"default": 0, "min": 0, "max": 50, "tooltip": "Толщина обводки"}),
                "outline_color": ("COLOR", {
                    "default": [0.3, 0.3, 0.3, 1.0],
                    "tooltip": "Цвет обводки"
                }),
                "rotate_with_mask": ("BOOLEAN", {"default": True, "tooltip": "Поворачивать с маской"}),
                "text_opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "min_font_size": ("INT", {"default": 8, "min": 1, "max": 500}),
                "max_font_size": ("INT", {"default": 500, "min": 10, "max": 2000}),
                "padding": ("INT", {"default": 5, "min": 0, "max": 200}),
                "vertical_align": (["top", "center", "bottom"], {"default": "center"}),
                "horizontal_align": (["left", "center", "right"], {"default": "center"}),
                "line_spacing": ("FLOAT", {"default": 1.0, "min": 0.5, "max": 3.0, "step": 0.1}),
                "letter_spacing": ("FLOAT", {"default": 0.0, "min": -20.0, "max": 100.0, "step": 0.5}),
                "text_orientation": (["horizontal", "vertical"], {"default": "horizontal"}),
            },
            "optional": {
                "enable_shadow": ("BOOLEAN", {"default": False}),
                "shadow_color": ("COLOR", {
                    "default": [0.2, 0.2, 0.2, 1.0],
                    "tooltip": "Цвет тени"
                }),
                "shadow_offset_x": ("INT", {"default": 2, "min": -50, "max": 50}),
                "shadow_offset_y": ("INT", {"default": 2, "min": -50, "max": 50}),
                "shadow_blur": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05}),
                "shadow_opacity": ("FLOAT", {"default": 0.8, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "apply_text"
    CATEGORY = "🦊 RaykoStudio"

    def __init__(self):
        self.debug = False

    def log(self, message: str, level: int = 1):
        if self.debug or level <= 0:
            prefix = {0: "❌", 1: "ℹ️", 2: "🔍"}.get(level, "•")
            print(f"{prefix} RS_TextOverlay: {message}")

    def get_font_path(self, font_name: str) -> Optional[str]:
        if font_name == "default":
            return None
            
        strategies = []
        current_dir = os.path.dirname(os.path.abspath(__file__))
        strategies.append(os.path.join(current_dir, "fonts", font_name))
        
        if HAS_FOLDER_PATHS:
            try:
                font_dirs = folder_paths.get_folder_paths("fonts")
                if font_dirs:
                    for font_dir in font_dirs:
                        strategies.append(os.path.join(font_dir, font_name))
            except KeyError:
                self.log("Folder 'fonts' not registered in ComfyUI", level=2)
            except Exception as e:
                self.log(f"Error accessing folder_paths: {e}", level=1)
        
        if os.path.isabs(font_name):
            strategies.append(font_name)
            
        for path in strategies:
            try:
                if path and os.path.isfile(path) and path.lower().endswith(('.ttf', '.otf', '.ttc')):
                    self.log(f"Font found: {path}", level=2)
                    return path
            except (OSError, PermissionError) as e:
                self.log(f"Cannot access {path}: {e}", level=0)
        
        return None

    @functools.lru_cache(maxsize=32)
    def get_cached_font(self, font_path: str, size: int) -> ImageFont.ImageFont:
        cache_key = (font_path, size)
        if cache_key in self._font_cache:
            return self._font_cache[cache_key]
        
        try:
            font = ImageFont.truetype(font_path, size)
            self._font_cache[cache_key] = font
            return font
        except Exception as e:
            raise FontNotFoundError(f"Не удалось загрузить шрифт: {e}")

    def parse_color(self, color: Any, alpha: float = 1.0) -> Tuple[int, int, int, int]:
        if color is None:
            return (255, 255, 255, int(alpha * 255))
        
        cache_key = (str(color), alpha)
        if cache_key in self._color_cache:
            return self._color_cache[cache_key]
        
        try:
            if isinstance(color, (list, tuple)) and len(color) >= 3:
                r = int(min(1.0, max(0.0, float(color[0]))) * 255)
                g = int(min(1.0, max(0.0, float(color[1]))) * 255)
                b = int(min(1.0, max(0.0, float(color[2]))) * 255)
                a = int(min(1.0, max(0.0, float(color[3]))) * 255) if len(color) >= 4 else int(alpha * 255)
                result = (r, g, b, a)
            
            elif isinstance(color, str):
                color_str = color.strip()
                
                if color_str.startswith('#'):
                    hex_val = color_str[1:]
                else:
                    hex_val = color_str
                
                if len(hex_val) == 3:
                    r = int(hex_val[0] * 2, 16)
                    g = int(hex_val[1] * 2, 16)
                    b = int(hex_val[2] * 2, 16)
                    a = int(alpha * 255)
                elif len(hex_val) == 6:
                    r = int(hex_val[0:2], 16)
                    g = int(hex_val[2:4], 16)
                    b = int(hex_val[4:6], 16)
                    a = int(alpha * 255)
                elif len(hex_val) == 8:
                    r = int(hex_val[0:2], 16)
                    g = int(hex_val[2:4], 16)
                    b = int(hex_val[4:6], 16)
                    a = int(hex_val[6:8], 16)
                else:
                    r, g, b, a = 255, 255, 255, int(alpha * 255)
                
                result = (r, g, b, a)
            else:
                result = (255, 255, 255, int(alpha * 255))
            
            self._color_cache[cache_key] = result
            return result
            
        except Exception as e:
            self.log(f"Color parse error: {e}", level=0)
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
        
        font_path, size_str = font_key.rsplit(':', 1)
        font = self.get_cached_font(font_path, int(size_str)) if font_path != "default" else ImageFont.load_default()
        
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
                char_count = len(line)
                line_width = draw.textlength(line, font=font) + letter_spacing * max(0, char_count - 1)
                line_height = (bbox[3] - bbox[1]) * line_spacing
            else:
                if line:
                    char_bbox = draw.textbbox((0, 0), line[0], font=font)
                    char_height = char_bbox[3] - char_bbox[1]
                    line_width = draw.textlength(line[0], font=font)
                    line_height = (char_height + letter_spacing) * len(line)
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
        font_key = lambda size: f"{font_path or 'default'}:{size}"
        
        if self.text_fits(font_key(max_size), text, max_width, max_height,
                         config.letter_spacing, config.line_spacing, 
                         config.outline_thickness, config.text_orientation):
            return self.get_cached_font(font_path, max_size) if font_path else ImageFont.load_default(), max_size
        
        low, high = min_size, max_size
        best_size, best_font = min_size, None
        
        while low <= high:
            mid = (low + high) // 2
            if pbar: pbar.update(1)
            
            try:
                font = self.get_cached_font(font_path, mid) if font_path else ImageFont.load_default()
            except FontNotFoundError:
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
            best_font = self.get_cached_font(font_path, min_size) if font_path else ImageFont.load_default()
            
        return best_font, best_size

    # ==================== Mask & Rotation (FIXED v3.10) ====================
    def _prepare_mask_for_opencv(self, mask_tensor: torch.Tensor) -> np.ndarray:
        """
        🛠 v3.10 FIX: Правильная конвертация маски для OpenCV
        
        Требуется формат: CV_8UC1 (single channel, 8-bit, uint8)
        """
        # 1. Конвертируем в numpy
        mask_np = mask_tensor.cpu().numpy()
        
        # 2. Убираем лишние измерения (если есть batch или channel)
        if mask_np.ndim == 3:
            # [H, W, C] или [C, H, W] → берём первый канал
            if mask_np.shape[0] in [1, 3, 4]:
                mask_np = mask_np[0]  # [C, H, W]
            elif mask_np.shape[-1] in [1, 3, 4]:
                mask_np = mask_np[:, :, 0]  # [H, W, C]
        elif mask_np.ndim == 4:
            # [B, H, W, C] или [B, C, H, W] → берём первый элемент
            mask_np = mask_np[0]
            if mask_np.ndim == 3:
                if mask_np.shape[0] in [1, 3, 4]:
                    mask_np = mask_np[0]
                elif mask_np.shape[-1] in [1, 3, 4]:
                    mask_np = mask_np[:, :, 0]
        
        # 3. Нормализуем значения (если float 0-1 → uint8 0-255)
        if mask_np.dtype == np.float32 or mask_np.dtype == np.float64:
            mask_np = (mask_np * 255).astype(np.uint8)
        elif mask_np.dtype != np.uint8:
            mask_np = mask_np.astype(np.uint8)
        
        # 4. Убеждаемся, что это 2D массив
        if mask_np.ndim != 2:
            self.log(f"Mask shape issue: {mask_np.shape}, attempting to fix", level=1)
            mask_np = mask_np.squeeze()
            if mask_np.ndim != 2:
                raise ValueError(f"Cannot convert mask to 2D: {mask_np.shape}")
        
        # 5. Бинаризация (опционально, для лучших контуров)
        _, mask_np = cv2.threshold(mask_np, 127, 255, cv2.THRESH_BINARY)
        
        return mask_np

    def calculate_mask_rotation(self, mask_np: np.ndarray) -> float:
        """
        Вычисляет угол поворота маски через minAreaRect.
        
        🛠 v3.10 FIX: mask_np уже в правильном формате CV_8UC1
        """
        mask_hash = hash(mask_np.tobytes())
        if mask_hash in self._contour_cache:
            return self._contour_cache[mask_hash]
        
        try:
            # 🛠 FIX: mask_np уже в формате CV_8UC1 из _prepare_mask_for_opencv
            contours, _ = cv2.findContours(mask_np, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if not contours:
                return 0.0
                
            contour = max(contours, key=cv2.contourArea)
            if cv2.contourArea(contour) < 10:
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
            self.log(f"Rotation calculation error: {e}", level=0)
            return 0.0

    # ==================== Text Rendering ====================
    def _draw_single_line(self, draw: ImageDraw.Draw, position: Tuple[float, float],
                         text: str, font: ImageFont.ImageFont, color: Tuple[int, int, int, int],
                         letter_spacing: float, text_orientation: str) -> None:
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

    def render_text_layer(self, text: str, config: TextRenderConfig, 
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
            
            if config.has_outline:
                thickness = config.outline_thickness
                steps = max(2, thickness // 2)
                for dx in range(-thickness, thickness + 1, steps):
                    for dy in range(-thickness, thickness + 1, steps):
                        if dx == 0 and dy == 0: continue
                        self._draw_single_line(draw, (start_x + dx, current_y + dy), 
                                             line, config.font, config.outline_color,
                                             config.letter_spacing, config.text_orientation)
            
            self._draw_single_line(draw, (start_x, current_y), line, config.font,
                                 config.text_color, config.letter_spacing, config.text_orientation)
            
            current_y += line_h
        
        if config.has_shadow:
            text_layer = self._apply_shadow_effect(text_layer, config)
        
        return text_layer

    def _apply_shadow_effect(self, text_layer: Image.Image, config: TextRenderConfig) -> Image.Image:
        alpha = text_layer.getchannel("A")
        shadow = Image.new("RGBA", text_layer.size, config.shadow_color)
        shadow.putalpha(alpha)
        
        if config.shadow_blur > 0:
            blur_radius = int(config.shadow_blur * 20)
            if blur_radius > 0:
                shadow = shadow.filter(ImageFilter.GaussianBlur(blur_radius))
        
        offset_x, offset_y = config.shadow_offset
        if offset_x or offset_y:
            shadow = shadow.transform(
                shadow.size, Image.AFFINE, (1, 0, offset_x, 0, 1, offset_y), 
                Image.BICUBIC, fill=(0, 0, 0, 0)
            )
        
        result = Image.new("RGBA", text_layer.size, (0, 0, 0, 0))
        result.paste(shadow, (0, 0), shadow)
        result.paste(text_layer, (0, 0), text_layer)
        return result

    # ==================== Main Processing ====================
    def _process_single(self, image: torch.Tensor, mask: torch.Tensor, text: str, 
                       font_name: str, config: TextRenderConfig,
                       padding: int, vertical_align: str, horizontal_align: str,
                       rotate_with_mask: bool, min_font_size: int, max_font_size: int) -> torch.Tensor:
        
        image_np = (image.cpu().numpy() * 255).astype(np.uint8)
        image_pil = Image.fromarray(image_np, 'RGB') if image_np.ndim == 3 else Image.fromarray(image_np[0], 'RGB')
        
        # 🛠 v3.10 FIX: Правильная конвертация маски
        mask_np = self._prepare_mask_for_opencv(mask)
        mask_pil = Image.fromarray(mask_np, 'L')
        
        bbox = mask_pil.getbbox()
        if not bbox:
            self.log("No bounding box in mask", level=1)
            return image
        
        x1, y1, x2, y2 = bbox
        available_w = max(1, x2 - x1 - 2 * padding)
        available_h = max(1, y2 - y1 - 2 * padding)
        
        font_path = self.get_font_path(font_name)
        
        pbar = ComfyProgressBar(max_font_size - min_font_size, "Finding font size") if HAS_PBAR else None
        
        config.font, actual_size = self.find_optimal_font_size(
            font_path, text, available_w, available_h, min_font_size, max_font_size, config, pbar
        )
        
        angle = self.calculate_mask_rotation(mask_np) if rotate_with_mask else 0
        
        diag = math.sqrt(available_w**2 + available_h**2)
        temp_size = int(diag * 1.2) + 50
        
        text_layer = self.render_text_layer(text, config, (temp_size, temp_size))
        
        if rotate_with_mask and abs(angle) > 0.1:
            text_layer = text_layer.rotate(angle, center=(temp_size//2, temp_size//2), 
                                          resample=Image.BICUBIC, expand=False)
        
        rot_bbox = text_layer.getbbox()
        if not rot_bbox:
            return image
            
        rx1, ry1, rx2, ry2 = rot_bbox
        text_w, text_h = rx2 - rx1, ry2 - ry1
        
        if rotate_with_mask:
            paste_x = int((x1 + x2 - text_w) / 2)
            paste_y = int((y1 + y2 - text_h) / 2)
        else:
            paste_x = {
                'left': x1 + padding,
                'right': x2 - text_w - padding,
                'center': int(x1 + (available_w - text_w) / 2 + padding)
            }[horizontal_align]
            paste_y = {
                'top': y1 + padding,
                'bottom': y2 - text_h - padding,
                'center': int(y1 + (available_h - text_h) / 2 + padding)
            }[vertical_align]
        
        cropped = text_layer.crop(rot_bbox)
        image_rgba = image_pil.convert("RGBA")
        
        overlay = Image.new("RGBA", image_rgba.size, (0, 0, 0, 0))
        overlay.paste(cropped, (paste_x, paste_y), cropped)
        
        result = Image.alpha_composite(image_rgba, overlay)
        
        result_np = np.array(result.convert("RGB")).astype(np.float32) / 255.0
        return torch.from_numpy(result_np).unsqueeze(0)

    def apply_text(self, 
                   image: torch.Tensor,
                   mask: torch.Tensor,
                   text: str,
                   font_name: str,
                   text_color: Any,
                   outline_thickness: int,
                   outline_color: Any,
                   rotate_with_mask: bool,
                   text_opacity: float,
                   min_font_size: int,
                   max_font_size: int,
                   padding: int,
                   vertical_align: str,
                   horizontal_align: str,
                   line_spacing: float,
                   letter_spacing: float,
                   text_orientation: str,
                   enable_shadow: bool = False,
                   shadow_color: Any = None,
                   shadow_offset_x: int = 2,
                   shadow_offset_y: int = 2,
                   shadow_blur: float = 0.0,
                   shadow_opacity: float = 0.8,
                   **kwargs) -> Tuple[torch.Tensor]:
        
        try:
            if image is None or image.numel() == 0:
                raise ValueError("Input image is empty")
            if mask is None or mask.numel() == 0:
                raise ValueError("Input mask is empty")
            
            config = TextRenderConfig(
                font=None,
                text_color=self.parse_color(text_color, text_opacity),
                outline_color=self.parse_color(outline_color, text_opacity),
                outline_thickness=outline_thickness,
                letter_spacing=letter_spacing,
                line_spacing=line_spacing,
                text_orientation=text_orientation,
                enable_shadow=enable_shadow,
                shadow_color=self.parse_color(shadow_color, shadow_opacity),
                shadow_offset=(shadow_offset_x, shadow_offset_y),
                shadow_blur=shadow_blur,
                text_opacity=int(text_opacity * 100)
            )
            
            if image.ndim == 4:
                results = []
                for i in range(image.shape[0]):
                    result = self._process_single(
                        image[i], mask[i] if mask.ndim == 4 else mask, text, font_name,
                        config, padding, vertical_align, horizontal_align,
                        rotate_with_mask, min_font_size, max_font_size
                    )
                    results.append(result)
                return (torch.cat(results, dim=0),)
            else:
                result = self._process_single(
                    image, mask, text, font_name, config, padding,
                    vertical_align, horizontal_align, rotate_with_mask, min_font_size, max_font_size
                )
                return (result,)
                
        except Exception as e:
            self.log(f"Error: {type(e).__name__}: {e}", level=0)
            import traceback
            traceback.print_exc()
            return (image,)


NODE_CLASS_MAPPINGS = {
    "RS_TextOverlay": RS_TextOverlay
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_TextOverlay": "🦊 RS Text Overlay v3.10"
}

__all__ = ["RS_TextOverlay", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]