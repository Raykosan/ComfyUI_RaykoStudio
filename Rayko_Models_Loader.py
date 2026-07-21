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
import os
from nodes import UNETLoader, CLIPLoader, VAELoader, LoraLoader, DualCLIPLoader
from server import PromptServer
import aiohttp

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PRESETS_DIR = os.path.join(CURRENT_DIR, "preset_models")
LORA_PRESETS_DIR = os.path.join(PRESETS_DIR, "loras")

os.makedirs(PRESETS_DIR, exist_ok=True)
os.makedirs(LORA_PRESETS_DIR, exist_ok=True)

class RaykoModelsLoader:
    @classmethod
    def INPUT_TYPES(cls):
        unet_files = folder_paths.get_filename_list("unet")
        clip_files = folder_paths.get_filename_list("clip")
        vae_files = folder_paths.get_filename_list("vae")
        
        vae_files_with_pixel = vae_files + ["pixel_space"]
        weight_dtype_opts = ["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]
        clip_type_opts = [
            "stable_diffusion", "stable_cascade", "sd3", "flux", "flux2", "lumina2", "ideogram4", "qwen_image", "boogu", "krea2", "ltxv", "wan", "ace", "hunyuan_image", "hidream", "chroma", "mochi", "cosmos", "pixart", "kolors", "ultrapix", "omnigen2", "ovis", "longcat_image", "cogvideox", "lens", "pixeldit",
        ]
        device_opts = ["default", "cpu", "cuda"]

        required = {
            "unet_name": (unet_files, {"tooltip": "Diffusion model (UNET)"}),
            "weight_dtype": (weight_dtype_opts, {"default": "default"}),
            "use_clip2": ("BOOLEAN", {"default": False, "label": "Enable second CLIP"}),
            "clip_name": (clip_files, {"tooltip": "First CLIP model (or primary CLIP for dual mode)"}),
            "clip_name2": (clip_files, {"tooltip": "Second CLIP model (for dual-clip models like Flux, SD3)"}),
            "clip_type": (clip_type_opts, {"default": "stable_diffusion"}),
            "clip_device": (device_opts, {"default": "default"}),
            "vae_name": (vae_files_with_pixel, {"tooltip": "model VAE (includes pixel_space for direct pixel manipulation)"}),
            "lora_data": ("STRING", {"default": "[]", "multiline": False, "forceInput": False}),
        }
        return {"required": required}

    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    RETURN_NAMES = ("MODEL", "CLIP", "VAE")
    FUNCTION = "load_models"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "The node combines the loaders of the model, clip, vae and lore. Presets allow quick switching between model configurations (UNET/CLIP/VAE) without affecting LoRA settings."

    @classmethod
    def IS_CHANGED(cls, lora_data="[]", **kwargs):
        import hashlib
        if lora_data is None: lora_data = "[]"
        return hashlib.md5(lora_data.encode()).hexdigest()

    def load_models(self, unet_name, weight_dtype, use_clip2, clip_name, clip_name2, clip_type, clip_device, vae_name, lora_data="[]"):
        if not lora_data: lora_data = "[]"
        
        wd = None if weight_dtype == "default" else weight_dtype
        model = UNETLoader().load_unet(unet_name=unet_name, weight_dtype=wd)[0]
        dev = None if clip_device == "default" else clip_device
        
        if use_clip2 and clip_name2 and clip_name2 != "None":
            clip = DualCLIPLoader().load_clip(clip_name1=clip_name, clip_name2=clip_name2, type=clip_type, device=dev)[0]
        else:
            clip = CLIPLoader().load_clip(clip_name=clip_name, type=clip_type, device=dev)[0]

        if vae_name == "pixel_space":
            sd = {"pixel_space_vae": torch.tensor(1.0)}
            vae = comfy.sd.VAE(sd=sd, metadata=None)
            vae.throw_exception_if_invalid()
        else:
            vae = VAELoader().load_vae(vae_name=vae_name)[0]

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
                        model, clip = lora_loader.load_lora(model, clip, lora_relative_path, strength_model, strength_clip)
                    except Exception as e:
                        print(f"[Rayko] ✗ LoRA Error: {e}")

        return (model, clip, vae)

NODE_CLASS_MAPPINGS = {"RaykoModelsLoader": RaykoModelsLoader}
NODE_DISPLAY_NAME_MAPPINGS = {"RaykoModelsLoader": "🦊 RS Models Loader"}

@PromptServer.instance.routes.get("/rayko/get_loras")
async def get_loras(request):
    return aiohttp.web.json_response(sorted(folder_paths.get_filename_list("loras"), key=lambda x: x.lower()))

# --- MODEL PRESETS ---
@PromptServer.instance.routes.post("/rayko_models/save_preset")
async def rayko_models_save_preset(request):
    try:
        data = await request.json()
        name = "".join(c for c in data.get("name", "").strip() if c.isalnum() or c in " _-").strip()
        if not name: return aiohttp.web.Response(status=400, text="Invalid name")
        filepath = os.path.join(PRESETS_DIR, f"{name}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({k: data.get(k, "") for k in ["unet_name", "weight_dtype", "use_clip2", "clip_name", "clip_name2", "clip_type", "clip_device", "vae_name"]}, f, indent=2)
        return aiohttp.web.Response(status=200, text="OK")
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))

@PromptServer.instance.routes.post("/rayko_models/list_presets")
async def rayko_models_list_presets(request):
    try:
        presets = [f[:-5] for f in os.listdir(PRESETS_DIR) if f.endswith('.json')] if os.path.exists(PRESETS_DIR) else []
        return aiohttp.web.json_response(sorted(presets, key=lambda x: x.lower()))
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))

@PromptServer.instance.routes.post("/rayko_models/load_preset")
async def rayko_models_load_preset(request):
    try:
        name = (await request.json()).get("name")
        filepath = os.path.join(PRESETS_DIR, f"{name}.json")
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return aiohttp.web.json_response(json.load(f))
        return aiohttp.web.Response(status=404, text="Preset not found")
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))

@PromptServer.instance.routes.post("/rayko_models/delete_preset")
async def rayko_models_delete_preset(request):
    try:
        name = (await request.json()).get("name")
        filepath = os.path.join(PRESETS_DIR, f"{name}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            return aiohttp.web.Response(status=200, text="OK")
        return aiohttp.web.Response(status=404, text="Preset not found")
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))

# --- LORA PRESETS ---
@PromptServer.instance.routes.post("/rayko_loras/save_preset")
async def rayko_loras_save_preset(request):
    try:
        data = await request.json()
        name = "".join(c for c in data.get("name", "").strip() if c.isalnum() or c in " _-").strip()
        if not name: return aiohttp.web.Response(status=400, text="Invalid name")
        filepath = os.path.join(LORA_PRESETS_DIR, f"{name}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({"lora_rows": data.get("lora_rows", [])}, f, indent=2)
        return aiohttp.web.Response(status=200, text="OK")
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))

@PromptServer.instance.routes.post("/rayko_loras/list_presets")
async def rayko_loras_list_presets(request):
    try:
        presets = [f[:-5] for f in os.listdir(LORA_PRESETS_DIR) if f.endswith('.json')] if os.path.exists(LORA_PRESETS_DIR) else []
        return aiohttp.web.json_response(sorted(presets, key=lambda x: x.lower()))
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))

@PromptServer.instance.routes.post("/rayko_loras/load_preset")
async def rayko_loras_load_preset(request):
    try:
        name = (await request.json()).get("name")
        filepath = os.path.join(LORA_PRESETS_DIR, f"{name}.json")
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return aiohttp.web.json_response(json.load(f))
        return aiohttp.web.Response(status=404, text="Preset not found")
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))

@PromptServer.instance.routes.post("/rayko_loras/delete_preset")
async def rayko_loras_delete_preset(request):
    try:
        name = (await request.json()).get("name")
        filepath = os.path.join(LORA_PRESETS_DIR, f"{name}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            return aiohttp.web.Response(status=200, text="OK")
        return aiohttp.web.Response(status=404, text="Preset not found")
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))