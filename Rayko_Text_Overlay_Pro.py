from scipy import ndimage
import os
import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import functools
from typing import Dict, Tuple, List, Optional, Any
from dataclasses import dataclass
import time
import re
from collections import OrderedDict
import folder_paths
from server import PromptServer
from aiohttp import web
import freetype
import cairo
import cv2
import json
import asyncio

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

TRANSFORM_CACHE = LRUCache(max_size=50)
PENDING_TRANSFORMS = LRUCache(max_size=50)
RENDER_CACHE = LRUCache(max_size=100)

GLOBAL_RENDERER = None

def get_renderer():
    global GLOBAL_RENDERER
    if GLOBAL_RENDERER is None:
        GLOBAL_RENDERER = RS_OverlayPro()
    return GLOBAL_RENDERER

def safe_font_path(font_name: str) -> Optional[str]:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    fonts_dir = os.path.join(current_dir, "fonts")
    if os.path.basename(font_name) != font_name:
        return None
    path = os.path.join(fonts_dir, font_name)
    if os.path.isfile(path):
        return path
    return None

@PromptServer.instance.routes.post("/rayko/rs_overlay_pro")
async def transform_handler(request):
    try:
        data = await request.json()
        node_id = str(data.get("id"))
        transforms = data.get("transforms")
        text_params = data.get("text_params", {})

        if node_id is None or transforms is None:
            return web.json_response({"error": "Missing data"}, status=400)

        required = {"x", "y", "rotation", "base_width_px", "base_height_px"}
        if not all(k in transforms for k in required):
            return web.json_response({"error": "Invalid transform data"}, status=400)

        if not isinstance(text_params, dict):
            return web.json_response({"error": "text_params must be object"}, status=400)

        TRANSFORM_CACHE.put(node_id, {
            **transforms,
            "text_params": text_params
        })

        if node_id in PENDING_TRANSFORMS.cache:
            PENDING_TRANSFORMS.cache[node_id]["status"] = "completed"

        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/rayko/rs_overlay_pro/get_fonts")
async def get_fonts_handler(request):
    try:
        renderer = get_renderer()
        font_list = renderer._get_font_list()
        return web.json_response({"font_list": font_list, "default_font": font_list[0] if font_list else ""})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_overlay_pro/cancel")
async def cancel_handler(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        if node_id:
            PENDING_TRANSFORMS.cache[node_id] = {"status": "cancelled"}
        return web.json_response({"status": "cancelled"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_overlay_pro/cleanup")
async def cleanup_handler(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        TRANSFORM_CACHE.cache.pop(node_id, None)
        PENDING_TRANSFORMS.cache.pop(node_id, None)

        temp_dir = folder_paths.get_temp_directory()
        for f in os.listdir(temp_dir):
            if f.startswith(f"rs_overlay_pro_{node_id}_"):
                try:
                    os.remove(os.path.join(temp_dir, f))
                except:
                    pass

        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_overlay_pro/render_masks")
async def render_masks_handler(request):
    try:
        data = await request.json()
        text_params = data.get("text_params", {})
        container_width = int(data.get("container_width", 400))
        container_height = int(data.get("container_height", 200))
        node_id = str(data.get("node_id", "unknown"))

        if container_width <= 0 or container_height <= 0:
            return web.json_response({"error": "Invalid container size"}, status=400)

        renderer = get_renderer()
        masks, render_size = renderer.render_masks_from_params(text_params, (container_width, container_height))

        ts = int(time.time() * 1000)
        result = {
            "width": render_size[0],
            "height": render_size[1],
            "timestamp": ts
        }

        for mask_name, mask_img in masks.items():
            filename = f"rs_overlay_pro_{node_id}_{ts}_{mask_name}.png"
            filepath = os.path.join(folder_paths.get_temp_directory(), filename)
            mask_img.save(filepath)
            result[f"{mask_name}_file"] = filename

        return web.json_response(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_overlay_pro/render_text")
async def render_text_handler(request):
    try:
        data = await request.json()
        text_params = data.get("text_params", {})
        container_width = int(data.get("container_width", 400))
        container_height = int(data.get("container_height", 200))
        node_id = str(data.get("node_id", "unknown"))

        if container_width <= 0 or container_height <= 0:
            return web.json_response({"error": "Invalid container size"}, status=400)

        renderer = get_renderer()
        text_layer = renderer.render_text_from_params(text_params, (container_width, container_height))

        ts = int(time.time() * 1000)
        filename = f"rs_overlay_pro_{node_id}_{ts}_text.png"
        filepath = os.path.join(folder_paths.get_temp_directory(), filename)
        text_layer.save(filepath)

        return web.json_response({
            "filename": filename,
            "width": text_layer.width,
            "height": text_layer.height,
            "timestamp": ts
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_overlay_pro/render_glow_mask")
async def render_glow_mask_handler(request):
    try:
        data = await request.json()
        text_mask_file = data.get("text_mask_file")
        glow_size = int(data.get("glow_size", 0))
        glow_spread = int(data.get("glow_spread", 0))
        glow_opacity = float(data.get("glow_opacity", 1.0))
        node_id = str(data.get("node_id", "unknown"))

        if not text_mask_file:
            return web.json_response({"error": "Missing text_mask_file"}, status=400)

        temp_dir = folder_paths.get_temp_directory()
        mask_path = os.path.join(temp_dir, text_mask_file)

        if not os.path.isfile(mask_path):
            return web.json_response({"error": "text_mask_file not found"}, status=404)

        cache_key = f"{text_mask_file}_{glow_size}_{glow_spread}_{glow_opacity}"
        cached = RENDER_CACHE.get(cache_key)
        if cached:
            return web.json_response(cached)

        text_mask = Image.open(mask_path).convert("RGBA")
        w, h = text_mask.size

        extra_padding = 0
        if glow_size > 0:
            extra_padding = int(glow_size * 1.0 + glow_spread * 0.3) + 10
            extra_padding = min(extra_padding, 300)

        expanded_w = w + 2 * extra_padding
        expanded_h = h + 2 * extra_padding
        expanded_mask = Image.new("RGBA", (expanded_w, expanded_h), (0, 0, 0, 0))
        paste_x = extra_padding
        paste_y = extra_padding
        expanded_mask.paste(text_mask, (paste_x, paste_y), text_mask)

        renderer = get_renderer()
        glow_mask = renderer._apply_glow_to_mask(
            expanded_mask, glow_size, glow_spread, glow_opacity
        )

        ts = int(time.time() * 1000)
        filename = f"rs_overlay_pro_{node_id}_{ts}_glow.png"
        filepath = os.path.join(temp_dir, filename)
        glow_mask.save(filepath)

        response_data = {
            "glow_file": filename,
            "width": glow_mask.width,
            "height": glow_mask.height,
            "timestamp": ts,
            "extra_padding": extra_padding
        }
        RENDER_CACHE.put(cache_key, response_data)
        return web.json_response(response_data)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_overlay_pro/render_shadow_mask")
async def render_shadow_mask(request):
    try:
        data = await request.json()
        text_mask_file = data.get("text_mask_file")
        shadow_blur = int(data.get("shadow_blur", 0))
        node_id = data.get("node_id", "0")

        if not text_mask_file:
            return web.json_response({"error": "text_mask_file is required"}, status=400)

        temp_dir = folder_paths.get_temp_directory()
        text_mask_path = os.path.join(temp_dir, text_mask_file)
        
        if not os.path.exists(text_mask_path):
            print(f"[RS Overlay Pro] ERROR: file does not exist at {text_mask_path}")
            return web.json_response({"error": "text_mask_file does not exist"}, status=404)

        img = Image.open(text_mask_path).convert("L")

        if shadow_blur > 0:
            from PIL import ImageFilter
            img = img.filter(ImageFilter.GaussianBlur(radius=shadow_blur))

        rgba = Image.new("RGBA", img.size, (0, 0, 0, 0))
        rgba.putalpha(img)

        timestamp = int(time.time() * 1000)
        out_name = f"shadow_{node_id}_{timestamp}.png"
        out_path = os.path.join(temp_dir, out_name)
        rgba.save(out_path, optimize=True)

        return web.json_response({
            "shadow_file": out_name,
            "timestamp": timestamp
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)

@dataclass
class TextRenderConfig:
    font: ImageFont.ImageFont
    font_path: str
    font_size: int
    text_color: Tuple[int, int, int, int]
    outline_color: Tuple[int, int, int, int]
    outline_thickness: int
    text_opacity: int = 100
    outline_opacity: int = 100
    effect_mode: str = "on"
    text_scale_x: float = 1.0
    text_scale_y: float = 1.0
    text_align: str = "left"
    line_spacing: float = 1.0
    letter_spacing: float = 0.0
    enable_glow: bool = False
    glow_color: Tuple[int, int, int, int] = (255, 255, 255, 255)
    glow_size: int = 100
    glow_spread: int = 150
    glow_opacity: float = 1.0
    enable_shadow: bool = False
    shadow_color: Tuple[int, int, int, int] = (51, 51, 51, 255)
    shadow_offset_x: int = 10
    shadow_offset_y: int = 10
    shadow_opacity: float = 0.8
    shadow_blur: int = 0 

    @property
    def has_outline(self) -> bool:
        return self.effect_mode == "on" and self.outline_thickness > 0

class HybridTextRenderer:
    @staticmethod
    def render_text_mask_pillow(font_path: str, font_size: int, text: str,
                                container_size: Tuple[int, int], text_align: str = "left",
                                padding_x: int = 20, padding_y: int = 25,
                                line_spacing: float = 1.0,
                                letter_spacing: float = 0.0) -> Image.Image:
        width, height = container_size
        text_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(text_layer)

        try:
            font = ImageFont.truetype(font_path, font_size, layout_engine=ImageFont.Layout.BASIC)
        except:
            font = ImageFont.load_default()

        lines = text.split('\n')
        if not lines:
            return text_layer

        first_bbox = draw.textbbox((0, 0), lines[0], font=font)
        line_height = first_bbox[3] - first_bbox[1]
        if line_height == 0:
            line_height = font_size

        total_text_height = line_height * len(lines) + (len(lines) - 1) * line_height * (line_spacing - 1)
        available_height = height - 2 * padding_y
        y_start = padding_y + (available_height - total_text_height) / 2
        baseline_offset = -first_bbox[1]
        y_start += baseline_offset

        current_y = y_start

        for line in lines:
            if not line:
                current_y += line_height * line_spacing
                continue

            line_bbox = draw.textbbox((0, 0), line, font=font)
            line_width = line_bbox[2] - line_bbox[0]
            if letter_spacing != 0.0 and len(line) > 1:
                line_width += letter_spacing * (len(line) - 1)

            available_width = width - 2 * padding_x
            if text_align == "left":
                x = padding_x - line_bbox[0]
            elif text_align == "center":
                x = padding_x + (available_width - line_width) / 2 - line_bbox[0]
            elif text_align == "right":
                x = width - padding_x - line_width - line_bbox[0]
            else:
                x = padding_x + (available_width - line_width) / 2 - line_bbox[0]

            if letter_spacing != 0.0 and len(line) > 0:
                pen_x = x
                for char in line:
                    draw.text((pen_x, current_y), char, font=font, fill=(255, 255, 255, 255))
                    char_width = draw.textlength(char, font=font)
                    pen_x += char_width + letter_spacing
            else:
                draw.text((x, current_y), line, font=font, fill=(255, 255, 255, 255))

            current_y += line_height * line_spacing

        return text_layer

    @staticmethod
    def render_outline_mask_pillow(font_path: str, font_size: int, text: str,
                                   outline_thickness: int, container_size: Tuple[int, int],
                                   text_align: str = "left",
                                   padding_x: int = 20, padding_y: int = 25,
                                   line_spacing: float = 1.0,
                                   letter_spacing: float = 0.0) -> Image.Image:
        if outline_thickness <= 0:
            return Image.new("RGBA", container_size, (0, 0, 0, 0))

        width, height = container_size
        text_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(text_layer)

        try:
            font = ImageFont.truetype(font_path, font_size, layout_engine=ImageFont.Layout.BASIC)
        except:
            font = ImageFont.load_default()

        lines = text.split('\n')
        if not lines:
            return text_layer

        first_bbox = draw.textbbox((0, 0), lines[0], font=font)
        line_height = first_bbox[3] - first_bbox[1]
        if line_height == 0:
            line_height = font_size

        total_text_height = line_height * len(lines) + (len(lines) - 1) * line_height * (line_spacing - 1)
        available_height = height - 2 * padding_y
        y_start = padding_y + (available_height - total_text_height) / 2
        baseline_offset = -first_bbox[1]
        y_start += baseline_offset

        current_y = y_start

        for line in lines:
            if not line:
                current_y += line_height * line_spacing
                continue

            line_bbox = draw.textbbox((0, 0), line, font=font)
            line_width = line_bbox[2] - line_bbox[0]
            if letter_spacing != 0.0 and len(line) > 1:
                line_width += letter_spacing * (len(line) - 1)

            available_width = width - 2 * padding_x
            if text_align == "left":
                x = padding_x - line_bbox[0]
            elif text_align == "center":
                x = padding_x + (available_width - line_width) / 2 - line_bbox[0]
            elif text_align == "right":
                x = width - padding_x - line_width - line_bbox[0]
            else:
                x = padding_x + (available_width - line_width) / 2 - line_bbox[0]

            if letter_spacing != 0.0 and len(line) > 0:
                pen_x = x
                for char in line:
                    draw.text((pen_x, current_y), char, font=font,
                              fill=(255, 255, 255, 255),
                              stroke_width=outline_thickness,
                              stroke_fill=(255, 255, 255, 255))
                    char_width = draw.textlength(char, font=font)
                    pen_x += char_width + letter_spacing
            else:
                draw.text((x, current_y), line, font=font,
                          fill=(255, 255, 255, 255),
                          stroke_width=outline_thickness,
                          stroke_fill=(255, 255, 255, 255))

            current_y += line_height * line_spacing

        return text_layer

    @staticmethod
    def apply_cairo_transform(image: Image.Image, scale_x: float, scale_y: float) -> Image.Image:
        if abs(scale_x - 1.0) < 0.01 and abs(scale_y - 1.0) < 0.01:
            return image

        width, height = image.size
        result_width = max(1, int(width * abs(scale_x)))
        result_height = max(1, int(height * abs(scale_y)))

        arr = np.array(image)
        bgra = np.zeros_like(arr)
        bgra[:, :, 0] = arr[:, :, 2]
        bgra[:, :, 1] = arr[:, :, 1]
        bgra[:, :, 2] = arr[:, :, 0]
        bgra[:, :, 3] = arr[:, :, 3]

        data = bgra.tobytes()
        source_surface = cairo.ImageSurface.create_for_data(
            bytearray(data), cairo.FORMAT_ARGB32, width, height
        )

        result_surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, result_width, result_height)
        ctx = cairo.Context(result_surface)
        ctx.set_source_rgba(0, 0, 0, 0)
        ctx.paint()

        ctx.save()
        ctx.translate(result_width / 2, result_height / 2)
        ctx.scale(scale_x, scale_y)
        ctx.translate(-width / 2, -height / 2)
        ctx.set_source_surface(source_surface, 0, 0)
        ctx.paint()
        ctx.restore()

        buf = result_surface.get_data()
        arr = np.frombuffer(buf, dtype=np.uint8).reshape(result_height, result_width, 4)
        rgba = np.zeros_like(arr)
        rgba[:, :, 0] = arr[:, :, 2]
        rgba[:, :, 1] = arr[:, :, 1]
        rgba[:, :, 2] = arr[:, :, 0]
        rgba[:, :, 3] = arr[:, :, 3]

        return Image.fromarray(rgba, 'RGBA')

class RS_OverlayPro:
    WEB_DIRECTORY = "web"
    _font_cache: Dict[Tuple[str, int], ImageFont.ImageFont] = {}
    _freetype_cache: Dict[Tuple[str, int], freetype.Face] = {}
    _text_dim_cache: LRUCache = LRUCache(max_size=200)
    _hex_color_pattern = re.compile(r'^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})?$')
    _hex_short_pattern = re.compile(r'^#?([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$')

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID"
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "composite"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True
    DESCRIPTION = "Interactive node for overlaying text on images with real-time positioning, scaling, rotation, and text editing"

    def __init__(self):
        self.hybrid_renderer = HybridTextRenderer()

    def get_font_path(self, font_name: str) -> Optional[str]:
        return safe_font_path(font_name)

    @functools.lru_cache(maxsize=64)
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
            raise Exception(f"Font error: {e}")

    @functools.lru_cache(maxsize=64)
    def get_freetype_face(self, font_path: str, size: int) -> freetype.Face:
        cache_key = (font_path, size)
        if cache_key in self._freetype_cache:
            return self._freetype_cache[cache_key]

        try:
            face = freetype.Face(font_path)
            face.set_char_size(size * 64)
            self._freetype_cache[cache_key] = face
            return face
        except Exception as e:
            raise Exception(f"FreeType error: {e}")

    def parse_color(self, color: Any, alpha: float = 1.0) -> Tuple[int, int, int, int]:
        if color is None:
            return (255, 255, 255, int(alpha * 255))

        try:
            if isinstance(color, str):
                color_str = color.strip()
                match = self._hex_color_pattern.match(color_str)
                if match:
                    r, g, b = int(match.group(1), 16), int(match.group(2), 16), int(match.group(3), 16)
                    a = int(match.group(4), 16) if match.group(4) else int(alpha * 255)
                    return (r, g, b, a)
                else:
                    match_short = self._hex_short_pattern.match(color_str)
                    if match_short:
                        r, g, b = int(match_short.group(1)*2, 16), int(match_short.group(2)*2, 16), int(match_short.group(3)*2, 16)
                        a = int(alpha * 255)
                        return (r, g, b, a)
                    else:
                        return (255, 255, 255, int(alpha * 255))
            else:
                return (255, 255, 255, int(alpha * 255))
        except Exception:
            return (255, 255, 255, int(alpha * 255))

    def _extract_text_params(self, text_params: dict, container_size: Tuple[int, int]) -> dict:
        font_list = self._get_font_list()
        text = text_params.get('text', '')
        if not text or not text.strip():
            text = ''

        font_name = text_params.get('font_name', '')
        if not font_name or font_name not in font_list:
            font_name = font_list[0] if font_list else ''

        font_path = self.get_font_path(font_name)
        if font_path is None and font_list:
            font_path = self.get_font_path(font_list[0])

        text_color = text_params.get('text_color', '#FFFFFF')
        outline_color = text_params.get('outline_color', '#808080')
        outline_thickness = int(text_params.get('outline_thickness', 0))
        effect_mode = str(text_params.get('effect_mode', 'on')).lower()
        effect_mode = 'on' if effect_mode in ('on', 'off') else 'on'
        text_scale_x = float(text_params.get('text_scale_x', 1.0))
        text_scale_y = float(text_params.get('text_scale_y', 1.0))
        text_align = str(text_params.get('text_align', 'left')).lower()
        text_align = text_align if text_align in ('left', 'center', 'right') else 'left'
        line_spacing = max(0.5, min(3.0, float(text_params.get('line_spacing', 1.0))))
        letter_spacing = max(-20.0, min(100.0, float(text_params.get('letter_spacing', 0.0))))
        min_font_size = int(text_params.get('min_font_size', 4))
        max_font_size = int(text_params.get('max_font_size', 2000))
        text_opacity = min(1.0, max(0.0, float(text_params.get('text_opacity', 1.0))))
        outline_opacity = min(1.0, max(0.0, float(text_params.get('outline_opacity', 1.0))))
        enable_glow = bool(text_params.get('enable_glow', False))
        glow_color = text_params.get('glow_color', '#FFFFFF')
        glow_size = int(text_params.get('glow_size', 0))
        glow_spread = int(text_params.get('glow_spread', 0))
        glow_opacity = min(1.0, max(0.0, float(text_params.get('glow_opacity', 1.0))))

        padding_x = int(container_size[0] * 0.2)          # 20% ширины
        padding_y = int(container_size[1] * 0.15)         # 15% высоты

        return {
            'text': text,
            'font_name': font_name,
            'font_path': font_path,
            'text_color': text_color,
            'outline_color': outline_color,
            'outline_thickness': outline_thickness,
            'effect_mode': effect_mode,
            'text_scale_x': text_scale_x,
            'text_scale_y': text_scale_y,
            'text_align': text_align,
            'line_spacing': line_spacing,
            'letter_spacing': letter_spacing,
            'min_font_size': min_font_size,
            'max_font_size': max_font_size,
            'text_opacity': text_opacity,
            'outline_opacity': outline_opacity,
            'enable_glow': enable_glow,
            'glow_color': glow_color,
            'glow_size': glow_size,
            'glow_spread': glow_spread,
            'glow_opacity': glow_opacity,
            'padding_x': padding_x,
            'padding_y': padding_y,
        }

    def calculate_text_dimensions_freetype(self, font_path: str, size: int, text: str,
                                           outline_thickness: int, line_spacing: float = 1.0,
                                           letter_spacing: float = 0.0) -> Tuple[float, float, List[float], List[float]]:
        cache_key = (f"{font_path}:{size}", text, outline_thickness, letter_spacing, line_spacing)
        cached = self._text_dim_cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            face = self.get_freetype_face(font_path, size)
        except:
            return self.calculate_text_dimensions_legacy(f"{font_path}:{size}", text, outline_thickness, line_spacing, letter_spacing)

        ascender = face.size.ascender / 64
        descender = face.size.descender / 64
        line_height_fixed = ascender - descender

        lines = text.split('\n')
        line_heights = []
        line_widths = []

        for line in lines:
            line = line.replace('\t', '    ')
            if not line:
                line_heights.append(line_height_fixed + outline_thickness * 2)
                line_widths.append(0 + outline_thickness * 2)
                continue

            ink_left = float('inf')
            ink_right = float('-inf')
            pen_x = 0
            prev_glyph_index = 0

            for i, char in enumerate(line):
                try:
                    face.load_char(char, freetype.FT_LOAD_DEFAULT | freetype.FT_LOAD_NO_BITMAP)
                    glyph = face.glyph
                    metrics = glyph.metrics

                    if i > 0 and prev_glyph_index != 0:
                        kerning = face.get_kerning(prev_glyph_index, glyph.index)
                        pen_x += kerning.x / 64

                    glyph_left = pen_x + metrics.horiBearingX / 64
                    glyph_right = glyph_left + metrics.width / 64

                    ink_left = min(ink_left, glyph_left)
                    ink_right = max(ink_right, glyph_right)

                    pen_x += metrics.horiAdvance / 64
                    if letter_spacing != 0.0:
                        pen_x += letter_spacing
                    prev_glyph_index = glyph.index
                except Exception:
                    continue

            if ink_left == float('inf'):
                line_width = 0
            else:
                line_width = ink_right - ink_left

            line_heights.append(line_height_fixed + outline_thickness * 2)
            line_widths.append(line_width + outline_thickness * 2)

        if line_heights:
            total_height = sum(line_heights)
            if len(line_heights) > 1:
                avg_line_height = line_heights[0]
                total_height += (len(line_heights) - 1) * avg_line_height * (line_spacing - 1)
        else:
            total_height = 0
        max_width = max(line_widths) if line_widths else 0

        result = (total_height, max_width, line_heights, line_widths)
        self._text_dim_cache.put(cache_key, result)
        return result

    def calculate_text_dimensions_legacy(self, font_key: str, text: str, outline_thickness: int,
                                         line_spacing: float = 1.0, letter_spacing: float = 0.0) -> Tuple[float, float, list, list]:
        temp_img = Image.new("RGB", (1, 1))
        draw = ImageDraw.Draw(temp_img)
        font_path, size_str = font_key.rsplit(':', 1) if ':' in font_key else (font_key, '12')

        try:
            font = self.get_cached_font(font_path, int(size_str)) if font_path != "default" else ImageFont.load_default()
        except:
            font = ImageFont.load_default()

        lines = text.split('\n')
        line_heights, line_widths = [], []

        for line in lines:
            line = line.replace('\t', '    ')
            if not line:
                line_heights.append(0)
                line_widths.append(0)
                continue

            bbox = draw.textbbox((0, 0), line, font=font)
            line_width = draw.textlength(line, font=font)

            if letter_spacing != 0.0 and len(line) > 1:
                line_width += letter_spacing * (len(line) - 1)

            line_height = (bbox[3] - bbox[1])
            line_heights.append(line_height + outline_thickness * 2)
            line_widths.append(line_width + outline_thickness * 2)

        if line_heights:
            total_height = sum(line_heights)
            if len(line_heights) > 1:
                avg_h = line_heights[0]
                total_height += (len(line_heights) - 1) * avg_h * (line_spacing - 1)
        else:
            total_height = 0
        max_width = max(line_widths) if line_widths else 0
        return (total_height, max_width, line_heights, line_widths)

    def text_fits(self, font_path: str, size: int, text: str, max_width: float, max_height: float,
                  outline_thickness: int, line_spacing: float = 1.0, letter_spacing: float = 0.0) -> bool:
        total_height, max_line_width, _, _ = self.calculate_text_dimensions_freetype(
            font_path, size, text, outline_thickness, line_spacing, letter_spacing
        )
        return max_line_width <= max_width and total_height <= max_height

    def find_optimal_font_size(self, font_path: Optional[str], text: str,
                               max_width: float, max_height: float,
                               min_size: int, max_size: int, config: TextRenderConfig) -> Tuple[ImageFont.ImageFont, int]:
        if font_path is None:
            font_path = "default"

        if self.text_fits(font_path, max_size, text, max_width, max_height,
                         config.outline_thickness,
                         config.line_spacing, config.letter_spacing):
            try:
                font = self.get_cached_font(font_path, max_size) if font_path != "default" else ImageFont.load_default()
                if font_path != "default" and hasattr(font, 'path'):
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

            try:
                font = self.get_cached_font(font_path, mid) if font_path != "default" else ImageFont.load_default()
            except:
                high = mid - 1
                continue

            if self.text_fits(font_path, mid, text, max_width, max_height,
                             config.outline_thickness,
                             config.line_spacing, config.letter_spacing):
                best_font, best_size = font, mid
                low = mid + 1
            else:
                high = mid - 1

        if best_font is None:
            try:
                best_font = self.get_cached_font(font_path, min_size) if font_path != "default" else ImageFont.load_default()
                if font_path != "default" and hasattr(best_font, 'path'):
                    best_font.path = font_path
                    best_font.size = min_size
            except:
                best_font = ImageFont.load_default()

        return best_font, best_size

    def _get_font_list(self) -> List[str]:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        fonts_dir = os.path.join(current_dir, "fonts")
        font_list = []

        if os.path.isdir(fonts_dir):
            for f in sorted(os.listdir(fonts_dir)):
                if f.lower().endswith(('.ttf', '.otf', '.ttc')):
                    font_list.append(f)

        font_list = [f for f in font_list if os.path.basename(f) == f]

        if "Arial.ttf" in font_list:
            font_list.remove("Arial.ttf")
        font_list.insert(0, "Arial.ttf")

        if not font_list:
            font_list = ["Arial.ttf"]

        return font_list

    def render_masks_from_params(self, text_params: dict, container_size: Tuple[int, int]) -> Tuple[Dict[str, Image.Image], Tuple[int, int]]:
        p = self._extract_text_params(text_params, container_size)
        text = p['text']
        if not text:
            empty_mask = Image.new("RGBA", container_size, (0,0,0,0))
            return {'text_mask': empty_mask, 'outline_mask': empty_mask}, container_size

        font_path = p['font_path']
        if font_path is None:
            font_list = self._get_font_list()
            font_path = self.get_font_path(font_list[0])

        temp_config = TextRenderConfig(
            font=None,
            font_path=font_path,
            font_size=0,
            text_color=(255,255,255,255),
            outline_color=(255,255,255,255),
            outline_thickness=p['outline_thickness'],
            effect_mode=p['effect_mode'],
            text_scale_x=p['text_scale_x'],
            text_scale_y=p['text_scale_y'],
            text_align=p['text_align'],
            line_spacing=p['line_spacing'],
            letter_spacing=p['letter_spacing']
        )

        available_w = max(1, container_size[0] - 2 * p['padding_x'])
        available_h = max(1, container_size[1] - 2 * p['padding_y'])

        font, actual_size = self.find_optimal_font_size(
            font_path, text, available_w, available_h,
            p['min_font_size'], p['max_font_size'], temp_config
        )

        text_mask = self.hybrid_renderer.render_text_mask_pillow(
            font_path, actual_size, text, container_size, p['text_align'],
            p['padding_x'], p['padding_y'], p['line_spacing'], p['letter_spacing']
        )
        text_mask = self.hybrid_renderer.apply_cairo_transform(
            text_mask, p['text_scale_x'], p['text_scale_y']
        )

        masks = {'text_mask': text_mask}

        if p['effect_mode'] == "on" and p['outline_thickness'] > 0:
            outline_mask = self.hybrid_renderer.render_outline_mask_pillow(
                font_path, actual_size, text, p['outline_thickness'], container_size,
                p['text_align'], p['padding_x'], p['padding_y'],
                p['line_spacing'], p['letter_spacing']
            )
            text_mask_no_transform = self.hybrid_renderer.render_text_mask_pillow(
                font_path, actual_size, text, container_size, p['text_align'],
                p['padding_x'], p['padding_y'], p['line_spacing'], p['letter_spacing']
            )
            text_arr = np.array(text_mask_no_transform)
            outline_arr = np.array(outline_mask)
            text_alpha = text_arr[:, :, 3].astype(np.float32)
            outline_alpha = outline_arr[:, :, 3].astype(np.float32)
            outline_only_alpha = np.clip(outline_alpha - text_alpha, 0, 255).astype(np.uint8)

            outline_only_arr = np.zeros_like(outline_arr)
            outline_only_arr[:, :, 0] = 255
            outline_only_arr[:, :, 1] = 255
            outline_only_arr[:, :, 2] = 255
            outline_only_arr[:, :, 3] = outline_only_alpha

            outline_only_mask = Image.fromarray(outline_only_arr, 'RGBA')
            outline_only_mask = self.hybrid_renderer.apply_cairo_transform(
                outline_only_mask, p['text_scale_x'], p['text_scale_y']
            )
            masks['outline_mask'] = outline_only_mask
        else:
            masks['outline_mask'] = Image.new("RGBA", (text_mask.width, text_mask.height), (0,0,0,0))

        render_size = (text_mask.width, text_mask.height)
        return masks, render_size

    def render_text_from_params(self, text_params: dict, container_size: Tuple[int, int], include_glow: bool = False) -> Image.Image:
        p = self._extract_text_params(text_params, container_size)
        text = p['text']
        if not text:
            return Image.new("RGBA", container_size, (0,0,0,0))

        masks, render_size = self.render_masks_from_params(text_params, container_size)
        text_mask = masks['text_mask']
        outline_mask = masks['outline_mask']

        # Извлекаем shadow-параметры
        enable_shadow = bool(text_params.get('enable_shadow', False))
        shadow_color = text_params.get('shadow_color', '#333333')
        shadow_opacity = min(1.0, max(0.0, float(text_params.get('shadow_opacity', 0.8))))
        shadow_offset_x = int(text_params.get('shadow_offset_x', 0))
        shadow_offset_y = int(text_params.get('shadow_offset_y', 0))
        shadow_blur = int(text_params.get('shadow_blur', 0))

        config = TextRenderConfig(
            font=None,
            font_path=p['font_path'],
            font_size=0,
            text_color=self.parse_color(p['text_color'], p['text_opacity']),
            outline_color=self.parse_color(p['outline_color'], p['outline_opacity']),
            outline_thickness=p['outline_thickness'],
            effect_mode=p['effect_mode'],
            text_scale_x=p['text_scale_x'],
            text_scale_y=p['text_scale_y'],
            text_align=p['text_align'],
            line_spacing=p['line_spacing'],
            letter_spacing=p['letter_spacing'],
            enable_glow=p['enable_glow'],
            glow_color=self.parse_color(p['glow_color'], p['glow_opacity']),
            glow_size=p['glow_size'],
            glow_spread=p['glow_spread'],
            glow_opacity=p['glow_opacity'],
            enable_shadow=enable_shadow,
            shadow_color=self.parse_color(shadow_color, shadow_opacity),
            shadow_offset_x=shadow_offset_x,
            shadow_offset_y=shadow_offset_y,
            shadow_opacity=shadow_opacity,
            shadow_blur=shadow_blur
        )

        result = Image.new("RGBA", render_size, (0,0,0,0))

        # 1. GLOW
        if include_glow and config.enable_glow and config.glow_size > 0:
            glow_mask = self._apply_glow_to_mask(
                text_mask, config.glow_size, config.glow_spread, config.glow_opacity
            )
            glow_colored = self._apply_color_to_mask(glow_mask, config.glow_color)
            result = Image.alpha_composite(result, glow_colored)

        # 2. SHADOW (под текстом и outline)
        if config.enable_shadow:
            shadow_mask = self._apply_shadow_to_mask(
                text_mask, config.shadow_blur, config.shadow_offset_x, config.shadow_offset_y
            )
            shadow_colored = self._apply_color_to_mask(shadow_mask, config.shadow_color)
            result = Image.alpha_composite(result, shadow_colored)

        # 3. OUTLINE
        if config.has_outline:
            outline_colored = self._apply_color_to_mask(outline_mask, config.outline_color)
            result = Image.alpha_composite(result, outline_colored)

        # 4. TEXT
        text_colored = self._apply_color_to_mask(text_mask, config.text_color)
        result = Image.alpha_composite(result, text_colored)

        return result

    def _apply_glow_to_mask(self, text_mask: Image.Image, glow_size: int,
                            glow_spread: int, glow_opacity: float) -> Image.Image:
        if glow_size <= 0:
            return Image.new("RGBA", text_mask.size, (0, 0, 0, 0))

        w, h = text_mask.size
        alpha = np.array(text_mask.getchannel("A"), dtype=np.uint8)

        _, binary = cv2.threshold(alpha, 127, 255, cv2.THRESH_BINARY)
        original_mask = binary.copy()

        if glow_spread > 0:
            iterations = max(1, int(glow_spread / 15))
            kernel = np.ones((3, 3), np.uint8)
            binary = cv2.dilate(binary, kernel, iterations=iterations)

        sigma = max(0.5, glow_size / 2.0)
        blurred = cv2.GaussianBlur(binary, (0, 0), sigmaX=sigma, sigmaY=sigma)

        glow_float = blurred.astype(np.float32) / 255.0
        original_float = original_mask.astype(np.float32) / 255.0
        glow_outer = glow_float * (1.0 - original_float)
        glow_outer = glow_outer * glow_opacity

        glow_arr = np.clip(glow_outer * 255, 0, 255).astype(np.uint8)
        glow_rgba = np.zeros((h, w, 4), dtype=np.uint8)
        glow_rgba[:, :, 3] = glow_arr

        return Image.fromarray(glow_rgba, 'RGBA')

    def _apply_color_to_mask(self, mask: Image.Image, color: Tuple[int, int, int, int]) -> Image.Image:
        arr = np.array(mask)
        alpha = arr[:, :, 3]

        colored_arr = np.zeros_like(arr)
        colored_arr[:, :, 0] = color[0]
        colored_arr[:, :, 1] = color[1]
        colored_arr[:, :, 2] = color[2]
        colored_arr[:, :, 3] = (alpha.astype(np.float32) * (color[3] / 255.0)).astype(np.uint8)

        return Image.fromarray(colored_arr, 'RGBA')

    def _apply_shadow_to_mask(self, text_mask: Image.Image, shadow_blur: int,
                              shadow_offset_x: int, shadow_offset_y: int) -> Image.Image:
        from scipy import ndimage
        
        w, h = text_mask.size
        
        alpha = np.array(text_mask.getchannel("A"), dtype=np.float32)
        
        if shadow_blur > 0:
            alpha = ndimage.gaussian_filter(alpha, sigma=shadow_blur / 2.0)
        
        shadow_alpha = np.zeros((h, w), dtype=np.float32)
        
        if shadow_offset_x >= 0:
            src_x_start, src_x_end = 0, w - shadow_offset_x
            dst_x_start, dst_x_end = shadow_offset_x, w
        else:
            src_x_start, src_x_end = -shadow_offset_x, w
            dst_x_start, dst_x_end = 0, w + shadow_offset_x
        
        if shadow_offset_y >= 0:
            src_y_start, src_y_end = 0, h - shadow_offset_y
            dst_y_start, dst_y_end = shadow_offset_y, h
        else:
            src_y_start, src_y_end = -shadow_offset_y, h
            dst_y_start, dst_y_end = 0, h + shadow_offset_y
        
        src_x_start = max(0, src_x_start)
        src_x_end = max(0, min(w, src_x_end))
        src_y_start = max(0, src_y_start)
        src_y_end = max(0, min(h, src_y_end))
        dst_x_start = max(0, dst_x_start)
        dst_x_end = max(0, min(w, dst_x_end))
        dst_y_start = max(0, dst_y_start)
        dst_y_end = max(0, min(h, dst_y_end))
        
        copy_w = min(src_x_end - src_x_start, dst_x_end - dst_x_start)
        copy_h = min(src_y_end - src_y_start, dst_y_end - dst_y_start)
        
        if copy_w > 0 and copy_h > 0:
            shadow_alpha[dst_y_start:dst_y_start+copy_h, dst_x_start:dst_x_start+copy_w] = \
                alpha[src_y_start:src_y_start+copy_h, src_x_start:src_x_start+copy_w]
        
        shadow_rgba = np.zeros((h, w, 4), dtype=np.uint8)
        shadow_rgba[:, :, 3] = np.clip(shadow_alpha, 0, 255).astype(np.uint8)
        
        return Image.fromarray(shadow_rgba, 'RGBA')

    def _calculate_extra_padding(self, text_params: dict) -> int:
        extra = 0
        if text_params.get('enable_glow', False):
            glow_size = int(text_params.get('glow_size', 0))
            glow_spread = int(text_params.get('glow_spread', 0))
            if glow_size > 0:
                extra = max(extra, int(glow_size * 1.0 + glow_spread * 0.3) + 10)
        if text_params.get('enable_shadow', False):
            shadow_offset_x = abs(int(text_params.get('shadow_offset_x', 0)))
            shadow_offset_y = abs(int(text_params.get('shadow_offset_y', 0)))
            shadow_extra = max(shadow_offset_x, shadow_offset_y) + 20
            extra = max(extra, shadow_extra)
        extra = min(extra, 300)
        return extra

    def tensor2pil(self, tensor):
        if len(tensor.shape) == 4:
            if tensor.shape[0] > 1:
                tensor = tensor[0]
        arr = (tensor.cpu().numpy() * 255).astype(np.uint8)
        while arr.ndim > 3:
            arr = arr[0]
        if arr.ndim < 3:
            arr = np.expand_dims(arr, axis=-1)
        c = arr.shape[2]
        if c >= 4:
            return Image.fromarray(arr[:,:,:4], 'RGBA')
        if c == 3:
            return Image.fromarray(arr, 'RGB')
        return Image.fromarray(arr[:,:,0], 'L')

    def pil2tensor(self, pil):
        if pil.mode == 'L':
            pil = pil.convert('RGB')
        elif pil.mode != 'RGB':
            pass
        return torch.from_numpy(np.array(pil).astype(np.float32) / 255.0).unsqueeze(0)

    def composite(self, image, unique_id=None):
        unique_id = str(unique_id) if unique_id is not None else "unknown"

        if image.numel() == 0:
            return (image,)

        h, w = image.shape[1], image.shape[2]
        if h < 8 or w < 8:
            return (image,)

        TRANSFORM_CACHE.cache.pop(unique_id, None)

        bg_pil = self.tensor2pil(image)
        bg_w, bg_h = bg_pil.size

        font_list = self._get_font_list()

        ts = int(time.time() * 1000)
        td = folder_paths.get_temp_directory()

        for f in os.listdir(td):
            if f.startswith(f"rs_overlay_pro_{unique_id}_"):
                try:
                    os.remove(os.path.join(td, f))
                except:
                    pass

        bfn = f"rs_overlay_pro_{unique_id}_{ts}_bg.png"
        bg_pil.save(os.path.join(td, bfn))

        PENDING_TRANSFORMS.cache[unique_id] = {"status": "pending"}

        PromptServer.instance.send_sync("rs-overlay-pro-start", {
            "id": unique_id,
            "bg_file": bfn,
            "bg_width": bg_w,
            "bg_height": bg_h,
            "timestamp": ts,
            "font_list": font_list,
            "default_font": font_list[0]
        })

        print(f"[RS Overlay Pro] Node {unique_id} waiting for user input (Apply/Cancel)...")

        timeout = 300
        start_time = time.time()
        while unique_id not in TRANSFORM_CACHE.cache:
            if unique_id in PENDING_TRANSFORMS.cache and PENDING_TRANSFORMS.cache[unique_id].get("status") == "cancelled":
                break
            if time.time() - start_time > timeout:
                print(f"[RS Overlay Pro] Timeout for node {unique_id}")
                PENDING_TRANSFORMS.cache.pop(unique_id, None)
                try:
                    os.remove(os.path.join(td, bfn))
                except:
                    pass
                return (self.pil2tensor(bg_pil),)
            time.sleep(0.2)

        if unique_id in PENDING_TRANSFORMS.cache:
            if PENDING_TRANSFORMS.cache[unique_id].get("status") == "cancelled":
                print(f"[RS Overlay Pro] Cancelled by user for node {unique_id}")
                PENDING_TRANSFORMS.cache.pop(unique_id, None)
                try:
                    os.remove(os.path.join(td, bfn))
                except:
                    pass
                return (self.pil2tensor(bg_pil),)

        print(f"[RS Overlay Pro] Input received for node {unique_id}")
        PENDING_TRANSFORMS.cache.pop(unique_id, None)

        data = TRANSFORM_CACHE.cache.pop(unique_id, None)
        if data is None:
            return (self.pil2tensor(bg_pil),)

        text_params = data.get("text_params", {})

        text = text_params.get('text', '')
        if not text or not text.strip():
            try:
                os.remove(os.path.join(td, bfn))
            except:
                pass
            return (self.pil2tensor(bg_pil),)

        rx = bg_w / 2 if data.get("x") is None else float(data.get("x"))
        ry = bg_h / 2 if data.get("y") is None else float(data.get("y"))
        rot = float(data.get("rotation") or 0)

        base_width_px = float(text_params.get('base_width_px', bg_w))
        base_height_px = float(text_params.get('base_height_px', bg_w * 3 / 5))
        base_width_px = max(10, min(bg_w, base_width_px))
        base_height_px = max(10, min(bg_h, base_height_px))

        text_layer = self.render_text_from_params(
            text_params, (int(base_width_px), int(base_height_px)),
            include_glow=True
        )

        if rot != 0:
            text_layer = text_layer.rotate(-rot, expand=True, resample=Image.Resampling.BICUBIC,
                                          center=(text_layer.width//2, text_layer.height//2))

        result = bg_pil.copy().convert("RGBA")
        paste_x = int(rx - text_layer.width // 2)
        paste_y = int(ry - text_layer.height // 2)
        result.paste(text_layer, (paste_x, paste_y), text_layer if text_layer.mode == 'RGBA' else None)

        try:
            os.remove(os.path.join(td, bfn))
        except:
            pass

        return (self.pil2tensor(result.convert("RGB")),)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return time.time()

NODE_CLASS_MAPPINGS = {"RS_OverlayPro": RS_OverlayPro}
NODE_DISPLAY_NAME_MAPPINGS = {"RS_OverlayPro": "🦊 RS Text Overlay Pro"}