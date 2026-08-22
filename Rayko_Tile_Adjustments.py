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
from PIL import Image

def pil2tensor(image):
    return torch.from_numpy(np.array(image).astype(np.float32) / 255.0).unsqueeze(0)

def tensor2pil(t_image):
    return Image.fromarray(np.clip(255.0 * t_image.cpu().numpy().squeeze(), 0, 255).astype(np.uint8))

class RSTileImage:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "width_factor_tile": ("INT", {"default": 3, "min": 1, "max": 10, "step": 1}),
                "height_factor_tile": ("INT", {"default": 3, "min": 1, "max": 10, "step": 1}),
                "overlap_rate": ("FLOAT", {"default": 0.1, "min": 0.00, "max": 0.95, "step": 0.05}),
            }
        }

    RETURN_TYPES = ("IMAGE", "LIST", "TUPLE", "TUPLE", "INT", "INT")
    RETURN_NAMES = ("IMAGES", "POSITIONS", "ORIGINAL_SIZE", "GRID_SIZE", "tile_width", "tile_height")
    FUNCTION = "process"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Calculates tile size based on factors/overlap and splits the image into a batch of tiles."

    def calculate_tile_size(self, raw_size, factor, overlap_rate):
        if overlap_rate == 0:
            if factor == 1:
                tile_size = raw_size
            else:
                tile_size = int(raw_size / factor)
        else:
            if factor == 1:
                tile_size = raw_size
            else:
                tile_size = int(raw_size / (1 + (factor - 1) * (1 - overlap_rate)))
        
        if tile_size % 8 != 0:
            tile_size = ((tile_size + 7) // 8) * 8
            
        return max(8, tile_size)

    def process(self, image, width_factor_tile, height_factor_tile, overlap_rate):
        _, raw_H, raw_W, _ = image.shape
        
        tile_width = self.calculate_tile_size(raw_W, width_factor_tile, overlap_rate)
        tile_height = self.calculate_tile_size(raw_H, height_factor_tile, overlap_rate)
        
        pil_image = tensor2pil(image[0].unsqueeze(0))
        img_width, img_height = pil_image.size
        
        if img_width <= tile_width and img_height <= tile_height:
            return (
                image, 
                [(0, 0, img_width, img_height)], 
                (img_width, img_height), 
                (1, 1),
                tile_width,
                tile_height
            )
            
        def calculate_step(size, tile_size):
            if size <= tile_size:
                return 1, 0
            else:
                num_tiles = (size + tile_size - 1) // tile_size
                overlap = (num_tiles * tile_size - size) // (num_tiles - 1)
                step = tile_size - overlap
                return num_tiles, step
                
        num_cols, step_x = calculate_step(img_width, tile_width)
        num_rows, step_y = calculate_step(img_height, tile_height)
        
        tiles = []
        positions = []
        
        for y in range(num_rows):
            for x in range(num_cols):
                left = x * step_x
                upper = y * step_y
                right = min(left + tile_width, img_width)
                lower = min(upper + tile_height, img_height)
                
                if right - left < tile_width:
                    left = max(0, img_width - tile_width)
                    right = img_width
                if lower - upper < tile_height:
                    upper = max(0, img_height - tile_height)
                    lower = img_height
                    
                tile = pil_image.crop((left, upper, right, lower))
                tile_tensor = pil2tensor(tile)
                tiles.append(tile_tensor)
                positions.append((left, upper, right, lower))
                
        if tiles:
            tiles_batch = torch.cat(tiles, dim=0)
        else:
            tiles_batch = image
            
        return (
            tiles_batch,
            positions,
            (img_width, img_height),
            (num_cols, num_rows),
            tile_width,
            tile_height
        )

NODE_CLASS_MAPPINGS = {
    "RSTileImage": RSTileImage
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSTileImage": "🦊 RS Tile Adjustments"
}