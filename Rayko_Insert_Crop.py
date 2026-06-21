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
import json

class RSInsertCropImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "original_image": ("IMAGE",),
                "cropped_image": ("IMAGE",),
            },
            "optional": {
                "crop_data": ("STRING", {"multiline": False, "default": "{}", "forceInput": True}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("IMAGE",)
    FUNCTION = "insert_crop"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True
    DESCRIPTION = "Node that allows insert a previously cut fragment back into the original image"

    def insert_crop(self, original_image, cropped_image, crop_data="{}"):
        try:
            if not crop_data.strip().startswith("{"):
                crop_data = "{" + crop_data + "}"
            crop_dict = json.loads(crop_data.replace("'", '"'))
        except Exception as e:
            print(f"[RS Insert Crop 🦊] Error parsing crop_ {e}")
            return (original_image,)
        
        x = int(crop_dict.get("x", 0))
        y = int(crop_dict.get("y", 0))
        crop_width = int(crop_dict.get("width", 0))
        crop_height = int(crop_dict.get("height", 0))
        
        if original_image is None or len(original_image) == 0:
            return (original_image,)
        
        if cropped_image is None or len(cropped_image) == 0:
            return (original_image,)
        
        img_tensor = original_image[0]
        img_height = img_tensor.shape[0]
        img_width = img_tensor.shape[1]
        
        crop_tensor = cropped_image[0]
        crop_h = crop_tensor.shape[0]
        crop_w = crop_tensor.shape[1]
        
        result = img_tensor.clone()
        
        x_start = max(0, x)
        y_start = max(0, y)
        x_end = min(x + crop_w, img_width)
        y_end = min(y + crop_h, img_height)
        
        crop_x_start = max(0, -x)
        crop_y_start = max(0, -y)
        crop_x_end = crop_x_start + (x_end - x_start)
        crop_y_end = crop_y_start + (y_end - y_start)
        
        if x_end > x_start and y_end > y_start and crop_x_end > crop_x_start and crop_y_end > crop_y_start:
            result[y_start:y_end, x_start:x_end, :] = crop_tensor[crop_y_start:crop_y_end, crop_x_start:crop_x_end, :]
        
        result = result.unsqueeze(0)
        
        return (result,)


NODE_CLASS_MAPPINGS = {"RSInsertCropImage": RSInsertCropImage}
NODE_DISPLAY_NAME_MAPPINGS = {"RSInsertCropImage": "🦊 RS Insert Crop"}