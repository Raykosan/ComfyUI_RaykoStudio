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
import math
import comfy.utils

class RS_ImageToLatent_Simplified:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Input image to convert to latent"}),
                "vae": ("VAE", {"tooltip": "VAE model for encoding"}),
                "batch_size": (
                    "INT", {
                        "default": 1, 
                        "min": 1, 
                        "max": 64, 
                        "step": 1,
                        "tooltip": "Number of identical latents in batch"
                    }
                ),
            }
        }
    
    RETURN_TYPES = ("LATENT", "INT", "INT")
    RETURN_NAMES = ("latent", "width_px", "height_px")
    FUNCTION = "convert"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Simplified version: converts image to latent with automatic size optimization"
    
    def _get_divisibility_from_vae(self, vae):
        if not hasattr(self, '_cached_divisibility'):
            try:
                with torch.no_grad():
                    test = torch.zeros(1, 64, 64, 3)
                    latent = vae.encode(test)
                    latent_h = latent["samples"].shape[2]
                    self._cached_divisibility = 64 // latent_h
            except:
                self._cached_divisibility = 16
        return self._cached_divisibility
    
    def _apply_divisibility(self, value, divisor):
        return round(value / divisor) * divisor
    
    def convert(self, image, vae, batch_size):
        divisibility = self._get_divisibility_from_vae(vae)
        
        _, img_h, img_w, _ = image.shape
        
        target_w = self._apply_divisibility(img_w, divisibility)
        target_h = self._apply_divisibility(img_h, divisibility)
        
        target_w = max(divisibility, target_w)
        target_h = max(divisibility, target_h)
        
        if (img_w, img_h) != (target_w, target_h):
            image = image.movedim(-1, 1)
            image = comfy.utils.common_upscale(image, target_w, target_h, "lanczos", "disabled")
            image = image.movedim(1, -1)
        
        if image.shape[-1] == 4:
            image = image[..., :3]

        if len(image.shape) == 3:
            image = image.unsqueeze(0)

        latent_output = vae.encode(image)

        if isinstance(latent_output, dict) and "samples" in latent_output:
            latent = latent_output["samples"]
        else:
            latent = latent_output

        if batch_size > 1 and latent.shape[0] == 1:
            latent = latent.repeat(batch_size, 1, 1, 1)

        return ({"samples": latent}, target_w, target_h)


NODE_CLASS_MAPPINGS = {
    "RS_ImageToLatent_Simplified": RS_ImageToLatent_Simplified,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_ImageToLatent_Simplified": "🦊 RS Image to Latent (simplified)",
}