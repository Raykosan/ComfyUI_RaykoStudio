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

import os
import torch
import numpy as np
from PIL import Image, PngImagePlugin
import folder_paths

def get_image_files():
    input_dir = folder_paths.get_input_directory()
    files = []
    for f in os.listdir(input_dir):
        if os.path.isfile(os.path.join(input_dir, f)) and f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.bmp')):
            files.append(f)
    files.sort()
    return files

class LoadImageWithText:
    @classmethod
    def INPUT_TYPES(cls):
        files = get_image_files()
        return {
            "required": {
                "mode": (["read", "write"], {"default": "read"}),
                "filename_prefix": ("STRING", {"default": "Civitai/prompt", "tooltip": "Prefix to save to output (write only)"}),
                "text_input": ("STRING", {"default": "", "multiline": True, "tooltip": "Text to write (write only)"}),
                "image": (files, {"image_upload": True}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "text")
    FUNCTION = "process"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True
    DESCRIPTION = "Node embeds any hidden text into the image that can be used later"

    def process(self, mode, image, text_input="", filename_prefix="ComfyUI"):
        try:
            input_path = folder_paths.get_annotated_filepath(image)
            if not os.path.exists(input_path):
                raise FileNotFoundError(f"File not found: {input_path}")

            if mode == "write":
                return self.write_mode(input_path, text_input, filename_prefix)
            else:
                return self.read_mode(input_path)
        except Exception as e:
            print(f"Error in process: {e}")
            import traceback
            traceback.print_exc()
            dummy_img = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
            return (dummy_img, "")

    def read_mode(self, input_path):
        pil_img = Image.open(input_path)
        text = pil_img.info.get("Description", "")
        image_tensor = self.pil_to_tensor(pil_img)
        print(f"[READ] Text: '{text}'")
        return (image_tensor, text)

    def write_mode(self, input_path, text, filename_prefix):
        pil_img = Image.open(input_path)
        image_tensor = self.pil_to_tensor(pil_img)

        pnginfo = PngImagePlugin.PngInfo()
        if text:
            pnginfo.add_text("Description", text)
            print(f"[WRITE] Text is recorded: '{text}'")

        output_dir = folder_paths.get_output_directory()
        
        counter = 1
        while True:
            output_filename = f"{filename_prefix}_{counter:05}.png"
            output_path = os.path.join(output_dir, output_filename)
            
            if not os.path.exists(output_path):
                break
            counter += 1
        
        print(f"[WRITE] Saved in: {output_path}")

        if pil_img.mode not in ('RGB', 'RGBA'):
            pil_img = pil_img.convert('RGB')
        
        pil_img.save(output_path, format="PNG", pnginfo=pnginfo)
        print(f"[WRITE] File saved: {os.path.exists(output_path)}")

        try:
            check_img = Image.open(output_path)
            saved_text = check_img.info.get("Description", "")
            print(f"[CHECK] Text in the saved file: '{saved_text}'")
        except Exception as e:
            print(f"[CHECK] Verification error: {e}")

        return (image_tensor, text)

    def pil_to_tensor(self, pil_img):
        if pil_img.mode == "RGBA":
            img_np = np.array(pil_img).astype(np.float32) / 255.0
        else:
            img_np = np.array(pil_img.convert("RGB")).astype(np.float32) / 255.0
        return torch.from_numpy(img_np)[None, ...]

NODE_CLASS_MAPPINGS = {
    "LoadImageWithText": LoadImageWithText,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "LoadImageWithText": "🦊 RS Image-Text ",
}