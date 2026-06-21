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

import logging
from typing import Dict, Any, Optional
import torch
from nodes import PreviewImage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RSComparer(PreviewImage):
    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        return {
            "required": {
                "zoom": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.1,
                        "max": 10.0,
                        "step": 0.1
                    }
                ),
                "pan_x": (
                    "INT",
                    {
                        "default": 0,
                        "min": -5000,
                        "max": 5000,
                        "step": 1
                    }
                ),
                "pan_y": (
                    "INT",
                    {
                        "default": 0,
                        "min": -5000,
                        "max": 5000,
                        "step": 1
                    }
                ),
            },
            "optional": {
                "image_1": ("IMAGE",),
                "image_2": ("IMAGE",),
            }
        }

    FUNCTION = "compare_images"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True
    DESCRIPTION = "A node that provides an interactive image comparison interface with zoom and pan controls"

    def compare_images(
        self,
        image_1: Optional[torch.Tensor] = None,
        image_2: Optional[torch.Tensor] = None,
        zoom: float = 1.0,
        pan_x: int = 0,
        pan_y: int = 0,
        filename_prefix: str = "RS_Compare_"
    ) -> Dict[str, Any]:
        
        ui_data: Dict[str, Any] = {"image_1": [], "image_2": []}
        
        if image_1 is not None:
            try:
                res_1 = self.save_images(image_1, filename_prefix + "1_")
                ui_data["image_1"] = res_1.get("ui", {}).get("images", [])
                logger.info("Successfully processed image_1 for comparison.")
            except Exception as e:
                logger.error(f"Error saving image_1: {e}")
                
        if image_2 is not None:
            try:
                res_2 = self.save_images(image_2, filename_prefix + "2_")
                ui_data["image_2"] = res_2.get("ui", {}).get("images", [])
                logger.info("Successfully processed image_2 for comparison.")
            except Exception as e:
                logger.error(f"Error saving image_2: {e}")

        return {"ui": ui_data}


NODE_CLASS_MAPPINGS = {
    "RSComparer": RSComparer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSComparer": "🦊 RS Image Compare",
}