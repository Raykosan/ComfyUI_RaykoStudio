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

class SaveImagePair:
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
            font_list = ["none"]

        return {
            "required": {
                "reference": ("IMAGE",),
                "final": ("IMAGE",),
                "filename_prefix": ("STRING", {"default": "ThumbnailPair/img"}),
                "concat_type": (["horizontal", "vertical"], {"default": "horizontal"}),
            },
            "optional": {
                "text1": ("STRING", {"multiline": True, "default": ""}),
                "text2": ("STRING", {"multiline": True, "default": ""}),
                "footer_height": ("INT", {"default": 100, "min": 0, "max": 1024}),
                "font_name": (font_list, {"default": font_list[0] if font_list else "none"}),
                "font_size": ("INT", {"default": 50, "min": 1, "max": 512}),
                "theme": (["dark", "light"], {"default": "light"}),
                "scale_factor": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images_pair"
    OUTPUT_NODE = True
    CATEGORY = "🦊 RaykoStudio"

    def save_images_pair(self, reference, final, filename_prefix="ThumbnailPair/img", concat_type="horizontal",
                         text1="", text2="", footer_height=100, font_name=None, font_size=50,
                         theme="light", scale_factor=1.0, prompt=None, extra_pnginfo=None):
        filename_prefix += self.prefix_append

        if theme == "dark":
            text_color_rgb = (255, 255, 255)
            bg_color_rgb = (0, 0, 0)
        else:
            text_color_rgb = (0, 0, 0)
            bg_color_rgb = (255, 255, 255)

        batch_ref = reference.shape[0]
        batch_fin = final.shape[0]
        if batch_ref != batch_fin:
            min_batch = min(batch_ref, batch_fin)
            print(f"Warning: Batch sizes differ ({batch_ref} vs {batch_fin}). Using first {min_batch} images.")
            reference = reference[:min_batch]
            final = final[:min_batch]
        else:
            min_batch = batch_ref

        font_path = None
        if font_name and font_name != "none":
            font_path = os.path.join(self.font_dir, font_name)
            if not os.path.isfile(font_path):
                font_path = None

        combined_images = []
        for i in range(min_batch):
            img_ref = Image.fromarray((reference[i].cpu().numpy() * 255).astype(np.uint8))
            img_fin = Image.fromarray((final[i].cpu().numpy() * 255).astype(np.uint8))

            target_w, target_h = img_ref.size
            if img_fin.size != (target_w, target_h):
                img_fin = img_fin.resize((target_w, target_h), Image.Resampling.LANCZOS)

            panel1 = None
            if footer_height > 0 and text1.strip():
                panel1 = create_text_panel(target_w, footer_height, text1, font_path, font_size,
                                           text_color_rgb, bg_color_rgb)
            panel2 = None
            if footer_height > 0 and text2.strip():
                panel2 = create_text_panel(target_w, footer_height, text2, font_path, font_size,
                                           text_color_rgb, bg_color_rgb)

            blocks = []
            if panel1 is not None:
                ref_block = combine_images_pil([img_ref, panel1], 'vertical')
            else:
                ref_block = img_ref
            if panel2 is not None:
                fin_block = combine_images_pil([img_fin, panel2], 'vertical')
            else:
                fin_block = img_fin

            if concat_type == "horizontal":
                combined_img = combine_images_pil([ref_block, fin_block], 'horizontal')
            else:
                combined_img = combine_images_pil([ref_block, fin_block], 'vertical')

            if scale_factor < 1.0:
                old_width, old_height = combined_img.size
                max_side = max(old_width, old_height)
                new_max_side = int(max_side * scale_factor)
                if new_max_side == 0:
                    new_max_side = 1
                ratio = new_max_side / max_side
                new_width = int(old_width * ratio)
                new_height = int(old_height * ratio)
                combined_img = combined_img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            combined_images.append(np.array(combined_img))

        combined_tensor = torch.from_numpy(np.stack(combined_images, axis=0)).float() / 255.0

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
    "SaveImagePair": SaveImagePair,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SaveImagePair": "🦊 RS Save Image Pair",
}