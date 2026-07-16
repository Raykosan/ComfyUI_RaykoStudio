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

import node_helpers
import comfy.utils

class RSRef2Latent:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "vae": ("VAE",),
                "image": ("IMAGE",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "LATENT")
    RETURN_NAMES = ("positive", "negative", "latent")
    FUNCTION = "process"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Converts reference image to latent and adds it as reference_latents in conditioning"

    def process(self, vae, image, positive, negative):
        if vae is None:
            raise RuntimeError("VAE is required. Please connect a VAE loader.")
        
        original_height, original_width = image.shape[1], image.shape[2]
        
        downscale_factor = getattr(vae, 'downscale_factor', 8)
        valid_multiple = downscale_factor * 8
        
        def round_to_valid(x):
            return ((x + valid_multiple - 1) // valid_multiple) * valid_multiple
        
        target_width = round_to_valid(original_width)
        target_height = round_to_valid(original_height)
        
        samples = image.movedim(-1, 1)
        vae_input = comfy.utils.common_upscale(samples, target_width, target_height, "lanczos", "center")
        vae_input = vae_input.movedim(1, -1)
        
        ref_latent = vae.encode(vae_input[:, :target_height, :target_width, :])
        
        positive_out = node_helpers.conditioning_set_values(positive, {"reference_latents": [ref_latent]}, append=True)
        negative_out = node_helpers.conditioning_set_values(negative, {"reference_latents": [ref_latent]}, append=True)
        
        latent = {"samples": ref_latent}
        
        return (positive_out, negative_out, latent)


NODE_CLASS_MAPPINGS = {
    "RSRef2Latent": RSRef2Latent,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSRef2Latent": "🦊 RS Ref 2 Latent",
}