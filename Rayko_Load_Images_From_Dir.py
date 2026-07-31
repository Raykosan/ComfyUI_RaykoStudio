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
import glob
import json
import torch
import numpy as np
import folder_paths
from PIL import Image
from typing import List, Dict, Any


class RSLoadImagesFromDir:
    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "required": {
                "node_data": ("STRING", {"default": "{}", "hidden": True}),
                "folder_path": ("STRING", {"default": "", "multiline": False}),
                "filter_type": (["*.*", "*.png", "*.jpg", "*.jpeg", "*.webp", "*.bmp", "*.gif", "custom"], {"default": "*.png"}),
                "start_index": ("INT", {"default": 1, "min": 1, "max": 999999, "step": 1}),
                "end_index": ("INT", {"default": 1, "min": 1, "max": 999999, "step": 1}),
            },
            "optional": {
                "custom_filter": ("STRING", {"default": "*.png", "multiline": False}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "INT")
    RETURN_NAMES = ("image", "filename", "folder_path", "number_of_files")
    OUTPUT_IS_LIST = (True, True, False, False)
    FUNCTION = "load_images"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Load images from directory. Preserves original size and alpha channel."

    def load_images(
        self,
        node_data: str = "{}",
        folder_path: str = "",
        filter_type: str = "*.png",
        start_index: int = 1,
        end_index: int = 1,
        custom_filter: str = "*.png"
    ):
        try:
            data = json.loads(node_data) if node_data else {}
            if data:
                folder_path = data.get("folder_path", folder_path)
                filter_type = data.get("filter_type", filter_type)
                start_index = data.get("start_index", start_index)
                end_index = data.get("end_index", end_index)
                custom_filter = data.get("custom_filter", custom_filter)
        except Exception:
            pass

        if not folder_path or not os.path.isdir(folder_path):
            raise ValueError(f"Invalid folder path: {folder_path}")

        pattern = custom_filter if filter_type == "custom" else filter_type
        search_pattern = os.path.join(folder_path, pattern)
        
        file_list = sorted(
            [f for f in glob.glob(search_pattern) if os.path.isfile(f)],
            key=lambda x: os.path.basename(x).lower()
        )

        total_files = len(file_list)
        images_list: List[torch.Tensor] = []
        filenames_list: List[str] = []

        if total_files == 0:
            return (images_list, filenames_list, folder_path, total_files)

        start_idx = max(0, min(start_index - 1, total_files - 1))
        end_idx = max(start_idx, min(end_index - 1, total_files - 1))

        for idx in range(start_idx, end_idx + 1):
            filepath = file_list[idx]
            filename = os.path.basename(filepath)
            
            try:
                img = Image.open(filepath)
                img_np = np.array(img).astype(np.float32) / 255.0
                
                if img_np.ndim == 2:
                    img_np = np.stack([img_np] * 3, axis=-1)
                
                img_tensor = torch.from_numpy(img_np).unsqueeze(0)
                images_list.append(img_tensor)
                filenames_list.append(filename)
                
            except Exception as e:
                print(f"[RaykoStudio] Error loading {filename}: {e}")

        return (images_list, filenames_list, folder_path, total_files)


NODE_CLASS_MAPPINGS = {"RSLoadImagesFromDir": RSLoadImagesFromDir}
NODE_DISPLAY_NAME_MAPPINGS = {"RSLoadImagesFromDir": "🦊 RS Load Images From Dir"}