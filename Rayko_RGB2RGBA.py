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
import os
import folder_paths
from PIL import Image

class LoadImageRGBA:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        return {
            "required": {
                "image": (sorted(files), {"image_upload": True}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("rgba",)
    FUNCTION = "load_image"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Loads an image with the alpha channel (RGBA) preserved. Supports PNG, WEBP, TIFF with transparency"

    def load_image(self, image):
        image_path = os.path.join(folder_paths.get_input_directory(), image)
        
        img = Image.open(image_path)
        
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        img_array = np.array(img).astype(np.float32) / 255.0
        
        tensor = torch.from_numpy(img_array).unsqueeze(0)
        
        print(f"[rgb2rgba ] Loaded {image}: {img.size}, mode={img.mode}")
        
        return (tensor,)

    @classmethod
    def IS_CHANGED(cls, image):
        image_path = os.path.join(folder_paths.get_input_directory(), image)
        return os.path.getmtime(image_path)

NODE_CLASS_MAPPINGS = {"LoadImageRGBA": LoadImageRGBA}
NODE_DISPLAY_NAME_MAPPINGS = {"LoadImageRGBA": "🦊 RS rgb2rgba"}