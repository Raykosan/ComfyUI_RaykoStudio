import torch
import math
import comfy.utils

class RS_ImageToLatent:
    @classmethod
    def INPUT_TYPES(cls):
        presets = [
            "Square - 512x512 (1:1)",
            "Square - 640x640 (1:1)",
            "Square - 768x768 (1:1)",
            "Square - 1024x1024 (1:1)",
            "Square - 1280x1280 (1:1)",
            "Square - 1536x1536 (1:1)",
            "Square - 1920x1920 (1:1)",
            "Portrait - 480x640 (3:4)",
            "Portrait - 512x768 (3:2)",
            "Portrait - 768x1024 (3:4)",
            "Portrait - 864x1152 (3:4)",
            "Portrait - 960x1280 (3:4)",
            "Portrait - 768x1152 (2:3)",
            "Portrait - 896x1344 (2:3)",
            "Portrait - 768x1344 (9:16)",
            "Portrait - 832x1152 (3:4)",
            "Portrait - 832x1216 (13:19)",
            "Portrait - 896x1088 (14:17)",
            "Portrait - 896x1152 (7:9)",
            "Portrait - 960x1024 (15:16)",
            "Portrait - 960x1088 (15:17)",
            "Portrait - 1024x1280 (4:5)",
            "Portrait - 1280x1536 (5:6)",
            "Portrait - 1344x1728 (7:9)",
            "Portrait - 1440x1920 (3:4)",
            "Portrait - 1024x1536 (2:3)",
            "Portrait - 1088x1856 (~6:10)",
            "Portrait - 1280x1920 (2:3)",
            "Portrait - 1080x1920 (9:16)",
            "Portrait - 816x1920 (21:9)",
            "Landscape - 640x480 (4:3)",
            "Landscape - 768x512 (3:2)",
            "Landscape - 1024x768 (4:3)",
            "Landscape - 1280x864 (4:3)",
            "Landscape - 1280x960 (4:3)",
            "Landscape - 1152x768 (3:2)",
            "Landscape - 1344x896 (3:2)",
            "Landscape - 1344x768 (7:4)",
            "Landscape - 1152x832 (9:7)",
            "Landscape - 1216x832 (19:13)",
            "Landscape - 1088x896 (17:14)",
            "Landscape - 1152x896 (9:7)",
            "Landscape - 1024x960 (16:15)",
            "Landscape - 1088x960 (17:15)",
            "Landscape - 1280x1024 (5:4)",
            "Landscape - 1536x1280 (6:5)",
            "Landscape - 1728x1344 (9:7)",
            "Landscape - 1920x1440 (4:3)",
            "Landscape - 1536x1024 (3:2)",
            "Landscape - 1856x1088 (~16:9)",
            "Landscape - 1920x1280 (3:2)",
            "Landscape - 1920x1080 (16:9)",
            "Landscape - 1920x1024 (15:8)",
            "Landscape - 1920x816 (20:9)",
        ]
        
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Input image to convert to latent"}),
                "vae": ("VAE", {"tooltip": "VAE model for encoding (auto-detects divisibility)"}),
                "mode": (
                    ["auto", "preset", "custom", "megapixels"],
                    {
                        "default": "auto",
                        "tooltip": "Size selection mode:\n"
                                  "- auto: Preserve image size with minimal rounding\n"
                                  "- preset: Use predefined resolution\n"
                                  "- custom: Manually enter width/height\n"
                                  "- megapixels: Set target megapixels"
                    }
                ),
                "preset": (presets, {"default": "Square - 1024x1024 (1:1)"}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 4096, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 4096, "step": 8}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1, "display": "slider"}),
                "aspect_ratio": (
                    ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "9:21"],
                    {"default": "1:1"}
                ),
                "divisibility_mode": (
                    ["auto", "8", "16", "32", "64", "112", "128"],
                    {"default": "auto", "tooltip": "Divisibility requirement (auto = detect from VAE)"}
                ),
                "upscale_method": (
                    ["lanczos", "bilinear", "nearest-exact", "bicubic"],
                    {"default": "lanczos"}
                ),
                "rounding_mode": (
                    ["auto", "shrink", "expand"],
                    {
                        "default": "auto", 
                        "tooltip": "How to adjust size for divisibility:\n"
                                  "- auto: pick nearest valid size\n"
                                  "- shrink: only reduce (never increase)\n"
                                  "- expand: only increase (never reduce)"
                    }
                ),
                "batch_size": (
                    "INT", {"default": 1, "min": 1, "max": 64, "step": 1,
                    "tooltip": "Number of identical latents in batch (useful for batch processing)"}
                ),
            }
        }
    
    RETURN_TYPES = ("LATENT", "INT", "INT", "INT", "INT")
    RETURN_NAMES = ("latent", "width_px", "height_px", "width_latent", "height_latent")
    FUNCTION = "convert"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Converts any image to latent with automatic size optimization for models"
    
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
    
    def _apply_divisibility(self, value, divisor, rounding_mode):
        if rounding_mode == "shrink":
            return (value // divisor) * divisor
        elif rounding_mode == "expand":
            return math.ceil(value / divisor) * divisor
        else:
            return round(value / divisor) * divisor
    
    def _calculate_target_size_auto(self, img_w, img_h, divisibility, rounding_mode):
        target_w = self._apply_divisibility(img_w, divisibility, rounding_mode)
        target_h = self._apply_divisibility(img_h, divisibility, rounding_mode)
        return max(divisibility, target_w), max(divisibility, target_h)
    
    def _calculate_target_size_preset(self, preset, divisibility, rounding_mode):
        size_map = {
            "Square - 512x512 (1:1)": (512, 512),
            "Square - 640x640 (1:1)": (640, 640),
            "Square - 768x768 (1:1)": (768, 768),
            "Square - 1024x1024 (1:1)": (1024, 1024),
            "Square - 1280x1280 (1:1)": (1280, 1280),
            "Square - 1536x1536 (1:1)": (1536, 1536),
            "Square - 1920x1920 (1:1)": (1920, 1920),
            "Portrait - 480x640 (3:4)": (480, 640),
            "Portrait - 512x768 (3:2)": (512, 768),
            "Portrait - 768x1024 (3:4)": (768, 1024),
            "Portrait - 864x1152 (3:4)": (864, 1152),
            "Portrait - 960x1280 (3:4)": (960, 1280),
            "Portrait - 768x1152 (2:3)": (768, 1152),
            "Portrait - 896x1344 (2:3)": (896, 1344),
            "Portrait - 768x1344 (9:16)": (768, 1344),
            "Portrait - 832x1152 (3:4)": (832, 1152),
            "Portrait - 832x1216 (13:19)": (832, 1216),
            "Portrait - 896x1088 (14:17)": (896, 1088),
            "Portrait - 896x1152 (7:9)": (896, 1152),
            "Portrait - 960x1024 (15:16)": (960, 1024),
            "Portrait - 960x1088 (15:17)": (960, 1088),
            "Portrait - 1024x1280 (4:5)": (1024, 1280),
            "Portrait - 1280x1536 (5:6)": (1280, 1536),
            "Portrait - 1344x1728 (7:9)": (1344, 1728),
            "Portrait - 1440x1920 (3:4)": (1440, 1920),
            "Portrait - 1024x1536 (2:3)": (1024, 1536),
            "Portrait - 1088x1856 (~6:10)": (1088, 1856),
            "Portrait - 1280x1920 (2:3)": (1280, 1920),
            "Portrait - 1080x1920 (9:16)": (1080, 1920),
            "Portrait - 816x1920 (21:9)": (816, 1920),
            "Landscape - 640x480 (4:3)": (640, 480),
            "Landscape - 768x512 (3:2)": (768, 512),
            "Landscape - 1024x768 (4:3)": (1024, 768),
            "Landscape - 1280x864 (4:3)": (1280, 864),
            "Landscape - 1280x960 (4:3)": (1280, 960),
            "Landscape - 1152x768 (3:2)": (1152, 768),
            "Landscape - 1344x896 (3:2)": (1344, 896),
            "Landscape - 1344x768 (7:4)": (1344, 768),
            "Landscape - 1152x832 (9:7)": (1152, 832),
            "Landscape - 1216x832 (19:13)": (1216, 832),
            "Landscape - 1088x896 (17:14)": (1088, 896),
            "Landscape - 1152x896 (9:7)": (1152, 896),
            "Landscape - 1024x960 (16:15)": (1024, 960),
            "Landscape - 1088x960 (17:15)": (1088, 960),
            "Landscape - 1280x1024 (5:4)": (1280, 1024),
            "Landscape - 1536x1280 (6:5)": (1536, 1280),
            "Landscape - 1728x1344 (9:7)": (1728, 1344),
            "Landscape - 1920x1440 (4:3)": (1920, 1440),
            "Landscape - 1536x1024 (3:2)": (1536, 1024),
            "Landscape - 1856x1088 (~16:9)": (1856, 1088),
            "Landscape - 1920x1280 (3:2)": (1920, 1280),
            "Landscape - 1920x1080 (16:9)": (1920, 1080),
            "Landscape - 1920x1024 (15:8)": (1920, 1024),
            "Landscape - 1920x816 (20:9)": (1920, 816),
        }
        w, h = size_map[preset]
        w = self._apply_divisibility(w, divisibility, rounding_mode)
        h = self._apply_divisibility(h, divisibility, rounding_mode)
        return max(divisibility, w), max(divisibility, h)
    
    def _calculate_target_size_megapixels(self, megapixels, aspect_ratio, divisibility, rounding_mode):
        w_ratio, h_ratio = map(int, aspect_ratio.split(":"))
        target_pixels = megapixels * 1_000_000
        x = math.sqrt(target_pixels / (w_ratio * h_ratio))
        raw_w, raw_h = w_ratio * x, h_ratio * x
        w, h = int(raw_w), int(raw_h)
        w = self._apply_divisibility(w, divisibility, rounding_mode)
        h = self._apply_divisibility(h, divisibility, rounding_mode)
        return max(divisibility, w), max(divisibility, h)
    
    def convert(self, image, vae, mode, preset, width, height, megapixels, 
                aspect_ratio, divisibility_mode, upscale_method, rounding_mode, batch_size):
        
        if divisibility_mode == "auto":
            divisibility = self._get_divisibility_from_vae(vae)
        else:
            divisibility = int(divisibility_mode)
        
        _, img_h, img_w, _ = image.shape
        
        if mode == "auto":
            target_w, target_h = self._calculate_target_size_auto(img_w, img_h, divisibility, rounding_mode)
        elif mode == "preset":
            target_w, target_h = self._calculate_target_size_preset(preset, divisibility, rounding_mode)
        elif mode == "custom":
            target_w = self._apply_divisibility(width, divisibility, rounding_mode)
            target_h = self._apply_divisibility(height, divisibility, rounding_mode)
        elif mode == "megapixels":
            target_w, target_h = self._calculate_target_size_megapixels(megapixels, aspect_ratio, divisibility, rounding_mode)
        else:
            target_w, target_h = img_w, img_h
        
        target_w = max(divisibility, target_w)
        target_h = max(divisibility, target_h)
        
        if (img_w, img_h) != (target_w, target_h):
            image = image.movedim(-1, 1)
            image = comfy.utils.common_upscale(image, target_w, target_h, upscale_method, "disabled")
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

        latent_h = latent.shape[2]
        latent_w = latent.shape[3]

        return ({"samples": latent}, target_w, target_h, latent_w, latent_h)


NODE_CLASS_MAPPINGS = {
    "RS_ImageToLatent": RS_ImageToLatent,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_ImageToLatent": "🦊 RS Image to Latent",
}