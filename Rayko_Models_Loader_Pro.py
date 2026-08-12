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
import comfy.sd
import torch
import json
import hashlib
from nodes import UNETLoader, CLIPLoader, VAELoader, LoraLoader, DualCLIPLoader

class RaykoModelsLoaderPro:
    @classmethod
    def INPUT_TYPES(cls):
        unet_files = ["None"] + folder_paths.get_filename_list("unet")
        clip_files = ["None"] + folder_paths.get_filename_list("clip")
        vae_files = ["None"] + folder_paths.get_filename_list("vae") + ["pixel_space"]
        
        weight_dtype_opts = ["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]
        clip_type_opts = [
            "stable_diffusion", "stable_cascade", "sd3", "flux", "flux2", "lumina2", "ideogram4", "qwen_image", "boogu", "krea2", "ltxv", "wan", "minimax", "joyimage", "mage", "ace", "hunyuan_image", "hidream", "chroma", "mochi", "cosmos", "pixart", "kolors", "ultrapix", "omnigen2", "ovis", "longcat_image", "cogvideox", "lens", "pixeldit",
        ]
        device_opts = ["default", "cpu", "cuda"]

        required = {
            "unet_name": (unet_files, {"default": "None", "tooltip": "Primary Diffusion model"}),
            "unet_name2": (unet_files, {"default": "None", "tooltip": "Secondary Diffusion model (optional, e.g., Refiner)"}),
            "weight_dtype": (weight_dtype_opts, {"default": "default"}),
            "clip_name": (clip_files, {"default": "None", "tooltip": "Primary CLIP model"}),
            "clip_name2": (clip_files, {"default": "None", "tooltip": "Secondary CLIP model (for dual-clip like Flux/SD3)"}),
            "clip_type": (clip_type_opts, {"default": "stable_diffusion"}),
            "clip_device": (device_opts, {"default": "default"}),
            "vae_name": (vae_files, {"default": "None", "tooltip": "Primary VAE model"}),
            "vae_name2": (vae_files, {"default": "None", "tooltip": "Secondary VAE model (optional)"}),
            "lora_data": ("STRING", {"default": "[]", "multiline": False, "forceInput": False}),
        }
        return {"required": required}

    RETURN_TYPES = ("MODEL", "MODEL", "CLIP", "VAE", "VAE")
    RETURN_NAMES = ("MODEL", "MODEL 2", "CLIP", "VAE", "VAE 2")
    FUNCTION = "load_models"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Pro version: Combines loaders for up to 2 models, dual-clip, 2 VAEs and LoRAs. Leave fields as 'None' if not needed."

    @classmethod
    def IS_CHANGED(cls, lora_data="[]", **kwargs):
        if lora_data is None: lora_data = "[]"
        return hashlib.md5(lora_data.encode()).hexdigest()

    def load_models(self, unet_name, unet_name2, weight_dtype, clip_name, clip_name2, clip_type, clip_device, vae_name, vae_name2, lora_data="[]"):
        if not lora_data: lora_data = "[]"
        
        wd = None if weight_dtype == "default" else weight_dtype
        dev = None if clip_device == "default" else clip_device

        model1 = UNETLoader().load_unet(unet_name=unet_name, weight_dtype=wd)[0] if unet_name != "None" else None
        model2 = UNETLoader().load_unet(unet_name=unet_name2, weight_dtype=wd)[0] if unet_name2 != "None" else None

        if clip_name2 != "None" and clip_name != "None":
            clip = DualCLIPLoader().load_clip(clip_name1=clip_name, clip_name2=clip_name2, type=clip_type, device=dev)[0]
        elif clip_name != "None":
            clip = CLIPLoader().load_clip(clip_name=clip_name, type=clip_type, device=dev)[0]
        elif clip_name2 != "None":
            clip = CLIPLoader().load_clip(clip_name=clip_name2, type=clip_type, device=dev)[0]
        else:
            clip = CLIPLoader().load_clip(clip_name=clip_files[1], type=clip_type, device=dev)[0]

        vae1 = VAELoader().load_vae(vae_name=vae_name)[0] if vae_name != "None" else None
        vae2 = VAELoader().load_vae(vae_name=vae_name2)[0] if vae_name2 != "None" else None

        if model1 is not None and clip is not None:
            try:
                loras = json.loads(lora_data) if lora_data else []
                if not isinstance(loras, list): loras = []
            except Exception:
                loras = []

            lora_loader = LoraLoader()
            for lora in loras:
                if not isinstance(lora, dict): continue
                name = lora.get("name", "")
                strength_model = float(lora.get("strength_model", 1.0))
                strength_clip = float(lora.get("strength_clip", strength_model))
                enabled = lora.get("enabled", True)

                if name and name != "None" and enabled:
                    lora_relative_path = name.replace("\\", "/")
                    lora_full_path = folder_paths.get_full_path("loras", lora_relative_path)
                    if lora_full_path:
                        try:
                            model1, clip = lora_loader.load_lora(model1, clip, lora_relative_path, strength_model, strength_clip)
                        except Exception as e:
                            print(f"[Rayko Pro] ✗ LoRA Error: {e}")

        return (model1, model2, clip, vae1, vae2)

NODE_CLASS_MAPPINGS = {"RaykoModelsLoaderPro": RaykoModelsLoaderPro}
NODE_DISPLAY_NAME_MAPPINGS = {"RaykoModelsLoaderPro": "🦊 RS Models Loader Pro"}