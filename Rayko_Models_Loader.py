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
import struct
import hashlib
import re
from nodes import UNETLoader, CLIPLoader, VAELoader, LoraLoader, DualCLIPLoader
from server import PromptServer
import aiohttp

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PRESETS_DIR = os.path.join(CURRENT_DIR, "preset_models")
LORA_PRESETS_DIR = os.path.join(PRESETS_DIR, "loras")
RAYKO_LORA_DATA_DIR = os.path.join(CURRENT_DIR, "rayko_lora_data")

os.makedirs(PRESETS_DIR, exist_ok=True)
os.makedirs(LORA_PRESETS_DIR, exist_ok=True)
os.makedirs(RAYKO_LORA_DATA_DIR, exist_ok=True)

# --- Helpers for LoRA Info ---

def clean_html(text):
    if not text:
        return ""
    clean = re.sub(r'<[^>]+>', ' ', str(text))
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

def compute_sha256(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()

def save_to_rayko_db(file_hash, data, source, overwrite=False):
    db_path = os.path.join(RAYKO_LORA_DATA_DIR, f"{file_hash}.json")
    if not overwrite and os.path.exists(db_path):
        return False
    db_data = {
        "hash": file_hash,
        "name": data.get("full_name", ""),
        "trained_words": data.get("trained_words", []),
        "description": data.get("description", ""),
        "source": source,
        "imported_at": __import__('datetime').datetime.now().isoformat()
    }
    with open(db_path, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, indent=2, ensure_ascii=False)
    return True

def extract_metadata_from_safetensors(lora_full_path):
    try:
        with open(lora_full_path, "rb") as f:
            header_size = struct.unpack("<Q", f.read(8))[0]
            header_bytes = f.read(header_size)
            header = json.loads(header_bytes.decode("utf-8"))
            if "__metadata__" in header:
                meta = header["__metadata__"]
                return {
                    "full_name": meta.get("modelspec.title", ""),
                    "trained_words": [t.strip() for t in meta.get("modelspec.tags", "").split(",") if t.strip()] if "modelspec.tags" in meta else [],
                    "description": clean_html(meta.get("modelspec.description", "") or meta.get("ss_training_comment", ""))
                }
    except Exception:
        pass
    return None

# --- Node ---

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

# --- General Endpoints ---

@PromptServer.instance.routes.get("/rayko/get_loras")
async def get_loras(request):
    return aiohttp.web.json_response(sorted(folder_paths.get_filename_list("loras"), key=lambda x: x.lower()))

@PromptServer.instance.routes.post("/rayko/get_lora_info")
async def rayko_get_lora_info(request):
    try:
        data = await request.json()
        lora_name = data.get("name", "")
        if not lora_name:
            return aiohttp.web.Response(status=400, text="No name provided")
        
        lora_relative_path = lora_name.replace("\\", "/")
        lora_full_path = folder_paths.get_full_path("loras", lora_relative_path)
        
        if not lora_full_path or not os.path.exists(lora_full_path):
            return aiohttp.web.json_response({"error": "File not found"})
        
        file_hash = compute_sha256(lora_full_path)
        
        db_path = os.path.join(RAYKO_LORA_DATA_DIR, f"{file_hash}.json")
        if os.path.exists(db_path):
            try:
                with open(db_path, 'r', encoding='utf-8') as f:
                    db_data = json.load(f)
                return aiohttp.web.json_response({
                    "full_name": db_data.get("name", lora_name),
                    "trained_words": db_data.get("trained_words", []),
                    "description": clean_html(db_data.get("description", "")),
                    "source": db_data.get("source", "rayko_db")
                })
            except Exception:
                pass
        
        safetensors_meta = extract_metadata_from_safetensors(lora_full_path)
        if safetensors_meta and (safetensors_meta["trained_words"] or safetensors_meta["description"]):
            save_to_rayko_db(file_hash, safetensors_meta, "safetensors")
            return aiohttp.web.json_response({
                "full_name": safetensors_meta["full_name"] or lora_name,
                "trained_words": safetensors_meta["trained_words"],
                "description": safetensors_meta["description"],
                "source": "safetensors"
            })
        
        return aiohttp.web.json_response({
            "full_name": lora_name,
            "trained_words": [],
            "description": "",
            "source": "none"
        })
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))

@PromptServer.instance.routes.post("/rayko/fetch_civitai_info")
async def rayko_fetch_civitai_info(request):
    try:
        data = await request.json()
        lora_name = data.get("name", "")
        if not lora_name:
            return aiohttp.web.Response(status=400, text="No name provided")
        
        lora_relative_path = lora_name.replace("\\", "/")
        lora_full_path = folder_paths.get_full_path("loras", lora_relative_path)
        
        if not lora_full_path or not os.path.exists(lora_full_path):
            return aiohttp.web.json_response({"error": "File not found"})
        
        file_hash = compute_sha256(lora_full_path)
        civitai_url = f"https://civitai.com/api/v1/model-versions/by-hash/{file_hash}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(civitai_url, headers={"User-Agent": "ComfyUI-RaykoStudio/1.0"}) as response:
                if response.status == 404:
                    return aiohttp.web.json_response({"error": "not_found", "message": "Not found on Civitai."})
                elif response.status == 429:
                    return aiohttp.web.json_response({"error": "rate_limit", "message": "Rate limit reached."})
                elif response.status != 200:
                    return aiohttp.web.json_response({"error": "api_error", "message": f"API status {response.status}"})
                
                civitai_data = await response.json()
            
            model_id = civitai_data.get("modelId")
            model_tags = []
            if model_id:
                try:
                    model_url = f"https://civitai.com/api/v1/models/{model_id}"
                    async with session.get(model_url, headers={"User-Agent": "ComfyUI-RaykoStudio/1.0"}) as model_response:
                        if model_response.status == 200:
                            model_data = await model_response.json()
                            model_tags = model_data.get("tags", [])
                except Exception as e:
                    print(f"[Rayko] Error fetching full model details: {e}")
        
        raw_trained = civitai_data.get("trainedWords", [])
        trained_words = []
        if isinstance(raw_trained, list):
            trained_words.extend([str(t).strip() for t in raw_trained if str(t).strip()])
        if isinstance(model_tags, list):
            trained_words.extend([str(t).strip() for t in model_tags if str(t).strip()])
        
        trained_words = list(dict.fromkeys(trained_words))
        
        raw_description = civitai_data.get("description", "")
        clean_description = clean_html(raw_description)
        
        model_name = civitai_data.get("model", {}).get("name", "")
        version_name = civitai_data.get("name", "")
        
        if model_name:
            if version_name and version_name.lower() not in ["v1", "v1.0", "default", "latest", ""]:
                full_name = f"{model_name} ({version_name})"
            else:
                full_name = model_name
        else:
            full_name = lora_name
        
        cache_data = {
            "full_name": full_name,
            "trained_words": trained_words,
            "description": clean_description
        }
        
        save_to_rayko_db(file_hash, cache_data, "civitai", overwrite=True)
        
        return aiohttp.web.json_response({
            "full_name": full_name,
            "trained_words": trained_words,
            "description": clean_description,
            "source": "civitai"
        })
    except aiohttp.ClientError as e:
        return aiohttp.web.json_response({"error": "network", "message": f"Network error: {str(e)}"})
    except Exception as e:
        return aiohttp.web.Response(status=500, text=str(e))

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