# SPDX-License-Identifier: Apache-2.0
# Copyright 2025-2026 Raykosan (RaykoStudio)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import torch
import numpy as np
from PIL import Image, PngImagePlugin, ImageDraw, ImageFont, ImageOps
import json
import os
import folder_paths
import textwrap

def get_font_list(font_dir):
    if not os.path.isdir(font_dir):
        return []
    return [f for f in os.listdir(font_dir) if f.lower().endswith(('.ttf', '.otf'))]

def create_text_panel(width, height, text, font_path, font_size, text_color, bg_color):
    panel = Image.new('RGB', (width, height), color=bg_color)
    draw = ImageDraw.Draw(panel)

    try:
        font = ImageFont.truetype(font_path, font_size)
    except Exception:
        font = ImageFont.load_default()

    avg_char_width = font_size * 0.6
    max_chars = int(width / avg_char_width)
    wrapped_lines = []
    for line in text.split('\n'):
        wrapped_lines.extend(textwrap.wrap(line, width=max_chars) if max_chars > 0 else [line])

    if not wrapped_lines:
        return panel

    line_height = font_size + 4
    total_text_height = len(wrapped_lines) * line_height

    y = (height - total_text_height) // 2

    for line in wrapped_lines:
        try:
            bbox = draw.textbbox((0, 0), line, font=font)
            line_width = bbox[2] - bbox[0]
        except AttributeError:
            line_width = draw.textsize(line, font=font)[0]
        x = (width - line_width) // 2
        draw.text((x, y), line, font=font, fill=text_color)
        y += line_height

    return panel

def combine_images_pil(images, direction='horizontal'):
    if direction == 'horizontal':
        widths, heights = zip(*(img.size for img in images))
        total_width = sum(widths)
        max_height = max(heights)
        combined = Image.new('RGB', (total_width, max_height))
        x_offset = 0
        for img in images:
            combined.paste(img, (x_offset, (max_height - img.height) // 2))
            x_offset += img.width
    else:
        widths, heights = zip(*(img.size for img in images))
        max_width = max(widths)
        total_height = sum(heights)
        combined = Image.new('RGB', (max_width, total_height))
        y_offset = 0
        for img in images:
            combined.paste(img, ((max_width - img.width) // 2, y_offset))
            y_offset += img.height
    return combined

class RSSaveImage:
    WEB_DIRECTORY = "web"

    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"
        self.prefix_append = ""
        self.compress_level = 4

        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.font_dir = os.path.join(self.script_dir, "fonts")
        self.font_list = get_font_list(self.font_dir)

    @classmethod
    def INPUT_TYPES(cls):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        font_dir = os.path.join(script_dir, "fonts")
        font_list = get_font_list(font_dir)
        if not font_list:
            font_list = ["default"]

        default_data = {
            "text": "",
            "font_name": font_list[0] if font_list else "default",
            "font_size": 50,
            "footer_height": 100,
            "theme": "light",
            "filename_prefix": "ComfyUI",
            "font_list": font_list
        }

        return {
            "required": {
                "images": ("IMAGE",),
                "node_data": ("STRING", {
                    "default": json.dumps(default_data),
                    "hidden": True
                }),
            },
            "optional": {},
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Node for adding explanatory text to an image"

    def save_images(self, images, node_data=None, prompt=None, extra_pnginfo=None):
        default_data = {
            "text": "",
            "font_name": "default",
            "font_size": 50,
            "footer_height": 100,
            "theme": "light",
            "filename_prefix": "ComfyUI",
            "font_list": []
        }
        
        try:
            if node_data:
                data = json.loads(node_data)
                data = {**default_data, **data}
            else:
                data = default_data
        except Exception as e:
            print(f"Error parsing node_data: {e}")
            data = default_data

        text = data.get("text", "")
        font_name = data.get("font_name", "default")
        font_size = data.get("font_size", 50)
        footer_height = data.get("footer_height", 100)
        theme = data.get("theme", "light")
        filename_prefix = data.get("filename_prefix", "ComfyUI")

        filename_prefix += self.prefix_append

        if theme == "dark":
            text_color_rgb = (255, 255, 255)
            bg_color_rgb = (0, 0, 0)
        else:
            text_color_rgb = (0, 0, 0)
            bg_color_rgb = (255, 255, 255)

        batch_size = images.shape[0]

        font_path = None
        if font_name and font_name != "none" and font_name != "default":
            font_path = os.path.join(self.font_dir, font_name)
            if not os.path.isfile(font_path):
                font_path = None
        elif font_name == "default":
            pass

        processed_images = []
        for i in range(batch_size):
            img = Image.fromarray((images[i].cpu().numpy() * 255).astype(np.uint8))

            if footer_height > 0 and text.strip():
                panel = create_text_panel(img.width, footer_height, text, font_path, font_size,
                                          text_color_rgb, bg_color_rgb)
                combined_img = combine_images_pil([img, panel], 'vertical')
            else:
                combined_img = img

            processed_images.append(np.array(combined_img))

        combined_tensor = torch.from_numpy(np.stack(processed_images, axis=0)).float() / 255.0

        full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(
            filename_prefix, self.output_dir, combined_tensor[0].shape[1], combined_tensor[0].shape[0])

        results = []
        for img_tensor in combined_tensor:
            img_np = (img_tensor.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
            img_pil = Image.fromarray(img_np)

            metadata = PngImagePlugin.PngInfo()
            if prompt is not None:
                metadata.add_text("prompt", json.dumps(prompt))
            if extra_pnginfo is not None:
                for key, value in extra_pnginfo.items():
                    metadata.add_text(key, json.dumps(value))

            file = f"{filename}_{counter:05}_.png"
            img_pil.save(os.path.join(full_output_folder, file), pnginfo=metadata, compress_level=self.compress_level)
            results.append({
                "filename": file,
                "subfolder": subfolder,
                "type": self.type
            })
            counter += 1

        return {"ui": {"images": results}}

NODE_CLASS_MAPPINGS = {
    "RSSaveImage": RSSaveImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSSaveImage": "🦊 RS Save Image",
}