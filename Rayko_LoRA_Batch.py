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

import folder_paths
import json
import hashlib
from nodes import LoraLoader


class RSLoRAbatch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {"tooltip": "Input model to apply LoRA"}),
                "use_clip": ("BOOLEAN", {
                    "default": True,
                    "label": "Apply LoRA to CLIP",
                    "tooltip": "Toggle CLIP application via UI button"
                }),
                "lora_data": ("STRING", {
                    "default": "[]",
                    "multiline": False,
                    "forceInput": False,
                    "tooltip": "JSON array of LoRA configs (managed by JS widget)"
                }),
            },
            "optional": {
                "clip": ("CLIP", {"tooltip": "Input CLIP to apply LoRA (optional)"}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("MODEL", "CLIP")
    FUNCTION = "load_lora"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Batch LoRA loader with CLIP toggle and queue-based batch mode."

    @classmethod
    def IS_CHANGED(cls, lora_data="[]", **kwargs):
        if lora_data is None:
            lora_data = "[]"
        return hashlib.md5(lora_data.encode()).hexdigest()

    def load_lora(self, model, use_clip, lora_data="[]", clip=None):
        if not lora_data:
            lora_data = "[]"
        try:
            loras = json.loads(lora_data) if isinstance(lora_data, str) else lora_data
            if not isinstance(loras, list):
                loras = []
        except Exception:
            loras = []

        lora_loader = LoraLoader()
        result_clip = clip

        for lora in loras:
            if not isinstance(lora, dict):
                continue
            name = lora.get("name", "")
            strength_model = float(lora.get("strength_model", 1.0))
            strength_clip = float(lora.get("strength_clip", strength_model))
            enabled = lora.get("enabled", True)

            if name and name != "None" and enabled:
                lora_relative_path = name.replace("\\", "/")
                lora_full_path = folder_paths.get_full_path("loras", lora_relative_path)
                if lora_full_path:
                    try:
                        if use_clip and clip is not None:
                            model, result_clip = lora_loader.load_lora(
                                model, result_clip, lora_relative_path,
                                strength_model, strength_clip
                            )
                        else:
                            model, _ = lora_loader.load_lora(
                                model, None, lora_relative_path,
                                strength_model, strength_clip
                            )
                    except Exception as e:
                        print(f"[RS LoRA Batch] Error loading '{name}': {e}")

        return (model, result_clip)


NODE_CLASS_MAPPINGS = {"RSLoRAbatch": RSLoRAbatch}
NODE_DISPLAY_NAME_MAPPINGS = {"RSLoRAbatch": "🦊 RS LoRA Tester"}