import folder_paths
import comfy.sd
import json
import os
from nodes import UNETLoader, CLIPLoader, VAELoader, LoraLoader, DualCLIPLoader
from server import PromptServer
import aiohttp

class RaykoModelsLoader:
    @classmethod
    def INPUT_TYPES(cls):
        unet_files = folder_paths.get_filename_list("unet")
        clip_files = folder_paths.get_filename_list("clip")
        vae_files = folder_paths.get_filename_list("vae")

        weight_dtype_opts = ["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]
        
        clip_type_opts = [
            "stable_diffusion", "stable_cascade", "sd3", "flux", "flux2", "lumina2", "qwen_image", "ltxv", "wan", "ace", "hunyuan_image", "hidream", "chroma", "mochi", "cosmos", "pixart", "kolors", "ultrapix",
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
            "vae_name": (vae_files, {"tooltip": "model VAE"}),
            "lora_data": ("STRING", {"default": "[]", "multiline": False, "forceInput": False}),
        }
        return {"required": required}

    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    RETURN_NAMES = ("MODEL", "CLIP", "VAE")
    FUNCTION = "load_models"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "The node combines the loaders of the model, clip, vae and lore."

    @classmethod
    def IS_CHANGED(cls, lora_data="[]", **kwargs):
        import hashlib
        if lora_data is None:
            lora_data = "[]"
        return hashlib.md5(lora_data.encode()).hexdigest()

    def load_models(self, unet_name, weight_dtype, use_clip2, clip_name, clip_name2, clip_type, clip_device, vae_name, lora_data="[]"):
        print(f"\n[Rayko] === Start load_models ===")
        print(f"[Rayko] lora_data RAW: {lora_data}")
        print(f"[Rayko] use_clip2: {use_clip2}")
        
        if not lora_data:
            lora_data = "[]"
        
        wd = None if weight_dtype == "default" else weight_dtype
        model = UNETLoader().load_unet(unet_name=unet_name, weight_dtype=wd)[0]
        print(f"[Rayko] UNET: {unet_name}")

        dev = None if clip_device == "default" else clip_device
        
        # CLIP loading logic with dual CLIP support
        if use_clip2 and clip_name2 and clip_name2 != "None":
            print(f"[Rayko] Using DualCLIPLoader mode")
            print(f"[Rayko] CLIP1: {clip_name}")
            print(f"[Rayko] CLIP2: {clip_name2}")
            print(f"[Rayko] CLIP type: {clip_type}")
            clip = DualCLIPLoader().load_clip(
                clip_name1=clip_name,
                clip_name2=clip_name2,
                type=clip_type,
                device=dev
            )[0]
        else:
            print(f"[Rayko] Using standard CLIPLoader mode")
            print(f"[Rayko] CLIP: {clip_name}")
            print(f"[Rayko] CLIP type: {clip_type}")
            clip = CLIPLoader().load_clip(
                clip_name=clip_name,
                type=clip_type,
                device=dev
            )[0]
        print(f"[Rayko] CLIP loaded successfully")

        vae = VAELoader().load_vae(vae_name=vae_name)[0]
        print(f"[Rayko] VAE: {vae_name}")

        try:
            loras = json.loads(lora_data) if lora_data else []
            if not isinstance(loras, list):
                loras = []
            print(f"[Rayko] LoRA count: {len(loras)}")
        except Exception as e:
            loras = []
            print(f"[Rayko] Parse error: {e}")

        lora_loader = LoraLoader()

        for i, lora in enumerate(loras):
            if not isinstance(lora, dict):
                continue
                
            name = lora.get("name", "")
            strength_model = float(lora.get("strength_model", 1.0))
            strength_clip = float(lora.get("strength_clip", strength_model))
            enabled = lora.get("enabled", True)

            print(f"[Rayko] LoRA[{i}]: {name} | strength={strength_model} | enabled={enabled}")

            if name and name != "None" and enabled:
                lora_relative_path = name.replace("\\", "/")
                lora_full_path = folder_paths.get_full_path("loras", lora_relative_path)
                
                if lora_full_path:
                    try:
                        print(f"[Rayko] Applying LoRA: {lora_relative_path} (strength={strength_model})")
                        model, clip = lora_loader.load_lora(
                            model, clip, 
                            lora_relative_path,
                            strength_model, 
                            strength_clip
                        )
                        print(f"[Rayko] ✓ LoRA applied successfully")
                    except Exception as e:
                        print(f"[Rayko] ✗ Error: {e}")
                else:
                    print(f"[Rayko] ✗ LoRA file not found: {lora_relative_path}")

        print(f"[Rayko] === load_models completed successfully ===\n")
        return (model, clip, vae)

NODE_CLASS_MAPPINGS = {"RaykoModelsLoader": RaykoModelsLoader}
NODE_DISPLAY_NAME_MAPPINGS = {"RaykoModelsLoader": "🦊 RS Models Loader"}

@PromptServer.instance.routes.get("/rayko/get_loras")
async def get_loras(request):
    loras = folder_paths.get_filename_list("loras")
    return aiohttp.web.json_response(sorted(loras, key=lambda x: x.lower()))