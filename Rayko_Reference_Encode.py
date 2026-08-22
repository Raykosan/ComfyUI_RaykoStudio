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

class RSReferenceLatentEncode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "pixels": ("IMAGE",),
                "vae": ("VAE",),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "execute"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Combines VAE Encode + Set Reference Latent"

    def execute(self, positive, negative, pixels, vae):
        if pixels.shape[3] > 3:
            pixels = pixels.narrow(3, 0, 3)

        latent_result = vae.encode(pixels)

        if isinstance(latent_result, dict):
            samples = latent_result["samples"]
        else:
            samples = latent_result

        ref_data = {"reference_latents": [samples]}

        new_positive = node_helpers.conditioning_set_values(
            positive, ref_data, append=True
        )
        new_negative = node_helpers.conditioning_set_values(
            negative, ref_data, append=True
        )

        return (new_positive, new_negative)


NODE_CLASS_MAPPINGS = {
    "RS_ReferenceEncode": RSReferenceLatentEncode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_ReferenceEncode": "🦊 RS Ref Encode",
}