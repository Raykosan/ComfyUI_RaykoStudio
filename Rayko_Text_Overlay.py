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
    text_opacity: int = 100

    @property
    def has_outline(self) -> bool:
        return self.outline_thickness > 0

    @property
    def has_shadow(self) -> bool:
        return self.enable_shadow and any(self.shadow_offset)

class RS_TextOverlay:
    WEB_DIRECTORY = "web"
    _font_cache: Dict[Tuple[str, int], ImageFont.ImageFont] = {}
    _color_cache: Dict[str, Tuple[int, int, int, int]] = {}
    _text_dim_cache: Dict[Tuple[str, str, float, float, float, int, str], Tuple[float, float, List[float], List[float]]] = {}
    _contour_cache: Dict[int, float] = {}
    _font_list: List[str] = None

    @classmethod
    def INPUT_TYPES(cls):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        fonts_dir = os.path.join(current_dir, "fonts")
        font_list = []
        default_font_path = os.path.join(fonts_dir, "Arial.ttf")
        if os.path.isfile(default_font_path):
            font_list.append("default")
        if os.path.isdir(fonts_dir):
            for f in sorted(os.listdir(fonts_dir)):
                if f.lower().endswith(('.ttf', '.otf', '.ttc')):
                    if f not in font_list:
                        font_list.append(f)
        if HAS_FOLDER_PATHS:
            try:
                system_font_dirs = folder_paths.get_folder_paths("fonts")
                if system_font_dirs:
                    for font_dir in system_font_dirs:
                        if os.path.isdir(font_dir):
                            for f in sorted(os.listdir(font_dir)):
                                if f.lower().endswith(('.ttf', '.otf', '.ttc')) and f not in font_list:
                                    font_list.append(f)
            except:
                pass
        cls._font_list = font_list
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
                        "font_list": font_list
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

    def log(self, message: str, level: int = 1):
        if self.debug or level <= 0:
            prefix = {0: "❌", 1: "ℹ️", 2: "🔍"}.get(level, "•")
            print(f"{prefix} RS_TextOverlay: {message}")

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
            self.log(f"Font found locally: {local_path}", level=2)
            return local_path
        if HAS_FOLDER_PATHS:
            try:
                system_font_dirs = folder_paths.get_folder_paths("fonts")
                if system_font_dirs:
                    for font_dir in system_font_dirs:
                        system_path = os.path.join(font_dir, font_name)
                        if os.path.isfile(system_path):
                            self.log(f"Font found in system: {system_path}", level=2)
                            return system_path
            except:
                pass
        if os.path.isabs(font_name) and os.path.isfile(font_name):
            return font_name
        self.log(f"Font not found: {font_name}", level=0)
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
                hex_val = color_str[1:] if color_str.startswith('#') else color_str
                if len(hex_val) == 3:
                    r, g, b = int(hex_val[0]*2, 16), int(hex_val[1]*2, 16), int(hex_val[2]*2, 16)
                    a = int(alpha * 255)
                elif len(hex_val) >= 6:
                    r, g, b = int(hex_val[0:2], 16), int(hex_val[2:4], 16), int(hex_val[4:6], 16)
                    a = int(hex_val[6:8], 16) if len(hex_val) >= 8 else int(alpha * 255)
                else:
                    r, g, b, a = 255, 255, 255, int(alpha * 255)
                result = (r, g, b, a)
            else:
                result = (255, 255, 255, int(alpha * 255))
            self._color_cache[cache_key] = result
            return result
        except:
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
            best_font = self.get_cached_font(font_path, min_size) if font_path else ImageFont.load_default()
        return best_font, best_size

    def _prepare_mask_for_opencv(self, mask_tensor: torch.Tensor) -> np.ndarray:
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
        except:
            return 0.0

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

    def render_text_layer(self, text, config, container_size):
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

    def _apply_shadow_effect(self, text_layer, config):
        alpha = text_layer.getchannel("A")
        shadow = Image.new("RGBA", text_layer.size, config.shadow_color)
        shadow.putalpha(alpha)
        if config.shadow_blur > 0:
            blur_radius = int(config.shadow_blur * 20)
            if blur_radius > 0:
                shadow = shadow.filter(ImageFilter.GaussianBlur(blur_radius))
        offset_x, offset_y = config.shadow_offset
        if offset_x or offset_y:
            shadow = shadow.transform(shadow.size, Image.AFFINE, (1, 0, offset_x, 0, 1, offset_y), Image.BICUBIC, fill=(0, 0, 0, 0))
        result = Image.new("RGBA", text_layer.size, (0, 0, 0, 0))
        result.paste(shadow, (0, 0), shadow)
        result.paste(text_layer, (0, 0), text_layer)
        return result

    def _process_single(self, image, mask, text, font_name, config, padding, vertical_align, horizontal_align,
                       rotate_with_mask, min_font_size, max_font_size):
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
        pbar = ComfyProgressBar(max_font_size - min_font_size, "Finding font size") if HAS_PBAR else None
        config.font, actual_size = self.find_optimal_font_size(font_path, text, available_w, available_h, min_font_size, max_font_size, config, pbar)
        angle = self.calculate_mask_rotation(mask_np) if rotate_with_mask else 0
        diag = math.sqrt(available_w**2 + available_h**2)
        temp_size = int(diag * 1.2) + 50
        text_layer = self.render_text_layer(text, config, (temp_size, temp_size))
        if rotate_with_mask and abs(angle) > 0.1:
            text_layer = text_layer.rotate(angle, center=(temp_size//2, temp_size//2), resample=Image.BICUBIC, expand=False)
        rot_bbox = text_layer.getbbox()
        if not rot_bbox:
            return image
        rx1, ry1, rx2, ry2 = rot_bbox
        text_w, text_h = rx2 - rx1, ry2 - ry1
        if rotate_with_mask:
            paste_x = int((x1 + x2 - text_w) / 2)
            paste_y = int((y1 + y2 - text_h) / 2)
        else:
            paste_x = {'left': x1 + padding, 'right': x2 - text_w - padding, 'center': int(x1 + (available_w - text_w) / 2 + padding)}[horizontal_align]
            paste_y = {'top': y1 + padding, 'bottom': y2 - text_h - padding, 'center': int(y1 + (available_h - text_h) / 2 + padding)}[vertical_align]
        cropped = text_layer.crop(rot_bbox)
        image_rgba = image_pil.convert("RGBA")
        overlay = Image.new("RGBA", image_rgba.size, (0, 0, 0, 0))
        overlay.paste(cropped, (paste_x, paste_y), cropped)
        result = Image.alpha_composite(image_rgba, overlay)
        result_np = np.array(result.convert("RGB")).astype(np.float32) / 255.0
        return torch.from_numpy(result_np).unsqueeze(0)

    def apply_text(self, image: torch.Tensor, mask: torch.Tensor, node_data: str = None, **kwargs) -> Tuple[torch.Tensor]:
        try:
            if image is None or image.numel() == 0:
                raise ValueError("Input image is empty")
            if mask is None or mask.numel() == 0:
                raise ValueError("Input mask is empty")
            data = {}
            if node_data:
                try:
                    data = json.loads(node_data)
                except:
                    pass
            text = data.get('text', 'Текст')
            font_name = data.get('font_name', 'default')
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
                    result = self._process_single(image[i], mask[i] if mask.ndim == 4 else mask, text, font_name,
                                                 config, 5, 'center', 'center', rotate_with_mask, 8, 500)
                    results.append(result)
                return (torch.cat(results, dim=0),)
            else:
                result = self._process_single(image, mask, text, font_name, config, 5,
                                             'center', 'center', rotate_with_mask, 8, 500)
                return (result,)
        except Exception as e:
            self.log(f"Error: {type(e).__name__}: {e}", level=0)
            import traceback
            traceback.print_exc()
            return (image,)

NODE_CLASS_MAPPINGS = {"RS_TextOverlay": RS_TextOverlay}
NODE_DISPLAY_NAME_MAPPINGS = {"RS_TextOverlay": "🦊 RS Text Overlay"}
__all__ = ["RS_TextOverlay", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]