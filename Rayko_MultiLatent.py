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

class RS_Image_MultiLatent:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "vae": ("VAE",),
                "size_mode": (["Preset", "Custom", "Megapixels"],),
                "active_preset": (["Standard", "Qwen", "Krea2"], {"default": "Standard"}),
                "preset_standard": (
                    [
                        "Square - 512x512 (1:1)", "Square - 640x640 (1:1)", "Square - 768x768 (1:1)",
                        "Square - 1024x1024 (1:1)", "Square - 1280x1280 (1:1)", "Square - 1536x1536 (1:1)",
                        "Square - 1920x1920 (1:1)",
                        "Portrait - 480x640 (3:4)", "Portrait - 512x768 (2:3)", "Portrait - 768x1024 (3:4)",
                        "Portrait - 864x1152 (3:4)", "Portrait - 960x1280 (3:4)", "Portrait - 768x1152 (2:3)",
                        "Portrait - 896x1344 (2:3)", "Portrait - 768x1344 (9:16)", "Portrait - 832x1152 (3:4)",
                        "Portrait - 832x1216 (13:19)", "Portrait - 896x1088 (14:17)", "Portrait - 896x1152 (7:9)",
                        "Portrait - 960x1024 (15:16)", "Portrait - 960x1088 (15:17)", "Portrait - 1024x1280 (4:5)",
                        "Portrait - 1280x1536 (5:6)", "Portrait - 1344x1728 (7:9)", "Portrait - 1440x1920 (3:4)",
                        "Portrait - 1024x1536 (2:3)", "Portrait - 1088x1856 (~6:10)", "Portrait - 1280x1920 (2:3)",
                        "Portrait - 1080x1920 (9:16)", "Portrait - 816x1920 (9:21)",
                        "Landscape - 640x480 (4:3)", "Landscape - 768x512 (3:2)", "Landscape - 1024x768 (4:3)",
                        "Landscape - 1280x864 (4:3)", "Landscape - 1280x960 (4:3)", "Landscape - 1152x768 (3:2)",
                        "Landscape - 1344x896 (3:2)", "Landscape - 1344x768 (7:4)", "Landscape - 1152x832 (9:7)",
                        "Landscape - 1216x832 (19:13)", "Landscape - 1088x896 (17:14)", "Landscape - 1152x896 (9:7)",
                        "Landscape - 1024x960 (16:15)", "Landscape - 1088x960 (17:15)", "Landscape - 1280x1024 (5:4)",
                        "Landscape - 1536x1280 (6:5)", "Landscape - 1728x1344 (9:7)", "Landscape - 1920x1440 (4:3)",
                        "Landscape - 1536x1024 (3:2)", "Landscape - 1856x1088 (~16:9)", "Landscape - 1920x1280 (3:2)",
                        "Landscape - 1920x1080 (16:9)", "Landscape - 1920x1024 (15:8)", "Landscape - 1920x816 (21:9)",
                    ],
                    {"default": "Square - 1024x1024 (1:1)"}
                ),
                "preset_qwen": (
                    [
                        "Square - 1008x1008 (1:1)", "Square - 1120x1120 (1:1)", "Square - 1344x1344 (1:1)",
                        "Square - 1568x1568 (1:1)", "Square - 1792x1792 (1:1)", "Square - 2016x2016 (1:1)",
                        "Portrait - 896x1120 (4:5)", "Portrait - 896x1344 (2:3)", "Portrait - 1008x1344 (3:4)",
                        "Portrait - 1008x1792 (9:16)", "Portrait - 1120x1456 (10:13)", "Portrait - 1120x1680 (2:3)",
                        "Portrait - 1120x1792 (5:8)", "Portrait - 1120x1904 (10:17)", "Portrait - 1120x2016 (5:6)",
                        "Portrait - 1120x2240 (1:2)", "Portrait - 1232x2016 (11:18)", "Portrait - 1232x2464 (1:2)",
                        "Portrait - 1344x1792 (3:4)", "Portrait - 1344x2016 (2:3)", "Portrait - 1344x2240 (3:5)",
                        "Portrait - 1344x2688 (1:2)", "Portrait - 1456x1792 (13:16)", "Portrait - 1456x2912 (1:2)",
                        "Portrait - 1568x2352 (2:3)", "Portrait - 1680x2016 (5:6)", "Portrait - 1680x2240 (3:4)",
                        "Portrait - 1792x2240 (4:5)",
                        "Landscape - 1120x896 (5:4)", "Landscape - 1344x896 (3:2)", "Landscape - 1344x1008 (4:3)",
                        "Landscape - 1792x1008 (16:9)", "Landscape - 1456x1120 (13:10)", "Landscape - 1680x1120 (3:2)",
                        "Landscape - 1792x1120 (8:5)", "Landscape - 1904x1120 (17:10)", "Landscape - 2016x1120 (6:5)",
                        "Landscape - 2240x1120 (2:1)", "Landscape - 2016x1232 (18:11)", "Landscape - 2464x1232 (2:1)",
                        "Landscape - 1792x1344 (4:3)", "Landscape - 2016x1344 (3:2)", "Landscape - 2240x1344 (5:3)",
                        "Landscape - 2688x1344 (2:1)", "Landscape - 1792x1456 (16:13)", "Landscape - 2912x1456 (2:1)",
                        "Landscape - 2352x1568 (3:2)", "Landscape - 2016x1680 (6:5)", "Landscape - 2240x1680 (4:3)",
                        "Landscape - 2240x1792 (5:4)",
                    ],
                    {"default": "Square - 1008x1008 (1:1)"}
                ),
                "preset_krea2": (
                    [
                        "Square - 512x512 (1:1)", "Square - 640x640 (1:1)", "Square - 768x768 (1:1)",
                        "Square - 1024x1024 (1:1)", "Square - 1280x1280 (1:1)", "Square - 1536x1536 (1:1)",
                        "Square - 1920x1920 (1:1)",
                        "Portrait - 480x640 (3:4)", "Portrait - 512x768 (2:3)", "Portrait - 768x1024 (3:4)",
                        "Portrait - 864x1152 (3:4)", "Portrait - 960x1280 (3:4)", "Portrait - 768x1152 (2:3)",
                        "Portrait - 896x1344 (2:3)", "Portrait - 768x1344 (9:16)", "Portrait - 832x1152 (3:4)",
                        "Portrait - 832x1216 (13:19)", "Portrait - 896x1088 (14:17)", "Portrait - 896x1152 (7:9)",
                        "Portrait - 960x1024 (15:16)", "Portrait - 960x1088 (15:17)", "Portrait - 1024x1280 (4:5)",
                        "Portrait - 1280x1536 (5:6)", "Portrait - 1344x1728 (7:9)", "Portrait - 1440x1920 (3:4)",
                        "Portrait - 1024x1536 (2:3)", "Portrait - 1088x1856 (~6:10)", "Portrait - 1280x1920 (2:3)",
                        "Portrait - 1080x1920 (9:16)", "Portrait - 816x1920 (9:21)",
                        "Landscape - 640x480 (4:3)", "Landscape - 768x512 (3:2)", "Landscape - 1024x768 (4:3)",
                        "Landscape - 1280x864 (4:3)", "Landscape - 1280x960 (4:3)", "Landscape - 1152x768 (3:2)",
                        "Landscape - 1344x896 (3:2)", "Landscape - 1344x768 (7:4)", "Landscape - 1152x832 (9:7)",
                        "Landscape - 1216x832 (19:13)", "Landscape - 1088x896 (17:14)", "Landscape - 1152x896 (9:7)",
                        "Landscape - 1024x960 (16:15)", "Landscape - 1088x960 (17:15)", "Landscape - 1280x1024 (5:4)",
                        "Landscape - 1536x1280 (6:5)", "Landscape - 1728x1344 (9:7)", "Landscape - 1920x1440 (4:3)",
                        "Landscape - 1536x1024 (3:2)", "Landscape - 1856x1088 (~16:9)", "Landscape - 1920x1280 (3:2)",
                        "Landscape - 1920x1080 (16:9)", "Landscape - 1920x1024 (15:8)", "Landscape - 1920x816 (21:9)",
                    ],
                    {"default": "Square - 1024x1024 (1:1)"}
                ),
                "width": ("INT", {"default": 1024, "min": 8, "max": 4096, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 8, "max": 4096, "step": 8}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
                "aspect_ratio": (["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "9:21", "4:5", "5:4"],),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64}),
            }
        }

    RETURN_TYPES = ("LATENT", "INT", "INT")
    RETURN_NAMES = ("latent", "width_px", "height_px")
    FUNCTION = "generate"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Universal latent generation node - automatically adapts to any VAE architecture."

    def generate(self, vae, size_mode, active_preset, preset_standard, preset_qwen, preset_krea2, width, height, megapixels, aspect_ratio, batch_size):
        latent_channels = 4
        scale_factor = 8
        
        if hasattr(vae, 'first_stage_config'):
            config = vae.first_stage_config
            latent_channels = getattr(config, 'latent_channels', 4)
            scale_factor = getattr(config, 'scale_factor', 8)
        elif hasattr(vae, 'latent_channels'):
            latent_channels = vae.latent_channels
            scale_factor = getattr(vae, 'scale_factor', 8)
        elif hasattr(vae, 'decoder') and hasattr(vae.decoder, 'conv_in'):
            try:
                if hasattr(vae.decoder, 'config'):
                    latent_channels = getattr(vae.decoder.config, 'latent_channels', 4)
                    scale_factor = getattr(vae.decoder.config, 'scale_factor', 8)
            except:
                pass
        
        if latent_channels <= 0 or latent_channels > 256:
            raise ValueError(f"Invalid latent_channels: {latent_channels}")
        if scale_factor <= 0 or scale_factor > 64:
            raise ValueError(f"Invalid scale_factor: {scale_factor}")
        
        print(f"[RS_Image_MultiLatent] VAE: {latent_channels} channels, {scale_factor}x scale. Active: {active_preset}")
        
        if size_mode == "Preset":
            if active_preset == "Standard":
                preset = preset_standard
            elif active_preset == "Qwen":
                preset = preset_qwen
            else:
                preset = preset_krea2
            
            size_map = {
                # Standard & Krea2
                "Square - 512x512 (1:1)": (512, 512), "Square - 640x640 (1:1)": (640, 640),
                "Square - 768x768 (1:1)": (768, 768), "Square - 1024x1024 (1:1)": (1024, 1024),
                "Square - 1280x1280 (1:1)": (1280, 1280), "Square - 1536x1536 (1:1)": (1536, 1536),
                "Square - 1920x1920 (1:1)": (1920, 1920),
                "Portrait - 480x640 (3:4)": (480, 640), "Portrait - 512x768 (2:3)": (512, 768),
                "Portrait - 768x1024 (3:4)": (768, 1024), "Portrait - 864x1152 (3:4)": (864, 1152),
                "Portrait - 960x1280 (3:4)": (960, 1280), "Portrait - 768x1152 (2:3)": (768, 1152),
                "Portrait - 896x1344 (2:3)": (896, 1344), "Portrait - 768x1344 (9:16)": (768, 1344),
                "Portrait - 832x1152 (3:4)": (832, 1152), "Portrait - 832x1216 (13:19)": (832, 1216),
                "Portrait - 896x1088 (14:17)": (896, 1088), "Portrait - 896x1152 (7:9)": (896, 1152),
                "Portrait - 960x1024 (15:16)": (960, 1024), "Portrait - 960x1088 (15:17)": (960, 1088),
                "Portrait - 1024x1280 (4:5)": (1024, 1280), "Portrait - 1280x1536 (5:6)": (1280, 1536),
                "Portrait - 1344x1728 (7:9)": (1344, 1728), "Portrait - 1440x1920 (3:4)": (1440, 1920),
                "Portrait - 1024x1536 (2:3)": (1024, 1536), "Portrait - 1088x1856 (~6:10)": (1088, 1856),
                "Portrait - 1280x1920 (2:3)": (1280, 1920), "Portrait - 1080x1920 (9:16)": (1080, 1920),
                "Portrait - 816x1920 (21:9)": (816, 1920),
                "Landscape - 640x480 (4:3)": (640, 480), "Landscape - 768x512 (3:2)": (768, 512),
                "Landscape - 1024x768 (4:3)": (1024, 768), "Landscape - 1280x864 (4:3)": (1280, 864),
                "Landscape - 1280x960 (4:3)": (1280, 960), "Landscape - 1152x768 (3:2)": (1152, 768),
                "Landscape - 1344x896 (3:2)": (1344, 896), "Landscape - 1344x768 (7:4)": (1344, 768),
                "Landscape - 1152x832 (9:7)": (1152, 832), "Landscape - 1216x832 (19:13)": (1216, 832),
                "Landscape - 1088x896 (17:14)": (1088, 896), "Landscape - 1152x896 (9:7)": (1152, 896),
                "Landscape - 1024x960 (16:15)": (1024, 960), "Landscape - 1088x960 (17:15)": (1088, 960),
                "Landscape - 1280x1024 (5:4)": (1280, 1024), "Landscape - 1536x1280 (6:5)": (1536, 1280),
                "Landscape - 1728x1344 (9:7)": (1728, 1344), "Landscape - 1920x1440 (4:3)": (1920, 1440),
                "Landscape - 1536x1024 (3:2)": (1536, 1024), "Landscape - 1856x1088 (~16:9)": (1856, 1088),
                "Landscape - 1920x1280 (3:2)": (1920, 1280), "Landscape - 1920x1080 (16:9)": (1920, 1080),
                "Landscape - 1920x1024 (15:8)": (1920, 1024), "Landscape - 1920x816 (21:9)": (1920, 816),
                # Qwen
                "Square - 1008x1008 (1:1)": (1008, 1008), "Square - 1120x1120 (1:1)": (1120, 1120),
                "Square - 1344x1344 (1:1)": (1344, 1344), "Square - 1568x1568 (1:1)": (1568, 1568),
                "Square - 1792x1792 (1:1)": (1792, 1792), "Square - 2016x2016 (1:1)": (2016, 2016),
                "Portrait - 896x1120 (4:5)": (896, 1120), "Portrait - 896x1344 (2:3)": (896, 1344),
                "Portrait - 1008x1344 (3:4)": (1008, 1344), "Portrait - 1008x1792 (9:16)": (1008, 1792),
                "Portrait - 1120x1456 (10:13)": (1120, 1456), "Portrait - 1120x1680 (2:3)": (1120, 1680),
                "Portrait - 1120x1792 (5:8)": (1120, 1792), "Portrait - 1120x1904 (10:17)": (1120, 1904),
                "Portrait - 1120x2016 (5:6)": (1120, 2016), "Portrait - 1120x2240 (1:2)": (1120, 2240),
                "Portrait - 1232x2016 (11:18)": (1232, 2016), "Portrait - 1232x2464 (1:2)": (1232, 2464),
                "Portrait - 1344x1792 (3:4)": (1344, 1792), "Portrait - 1344x2016 (2:3)": (1344, 2016),
                "Portrait - 1344x2240 (3:5)": (1344, 2240), "Portrait - 1344x2688 (1:2)": (1344, 2688),
                "Portrait - 1456x1792 (13:16)": (1456, 1792), "Portrait - 1456x2912 (1:2)": (1456, 2912),
                "Portrait - 1568x2352 (2:3)": (1568, 2352), "Portrait - 1680x2016 (5:6)": (1680, 2016),
                "Portrait - 1680x2240 (3:4)": (1680, 2240), "Portrait - 1792x2240 (4:5)": (1792, 2240),
                "Landscape - 1120x896 (5:4)": (1120, 896), "Landscape - 1344x896 (3:2)": (1344, 896),
                "Landscape - 1344x1008 (4:3)": (1344, 1008), "Landscape - 1792x1008 (16:9)": (1792, 1008),
                "Landscape - 1456x1120 (13:10)": (1456, 1120), "Landscape - 1680x1120 (3:2)": (1680, 1120),
                "Landscape - 1792x1120 (8:5)": (1792, 1120), "Landscape - 1904x1120 (17:10)": (1904, 1120),
                "Landscape - 2016x1120 (6:5)": (2016, 1120), "Landscape - 2240x1120 (2:1)": (2240, 1120),
                "Landscape - 2016x1232 (18:11)": (2016, 1232), "Landscape - 2464x1232 (2:1)": (2464, 1232),
                "Landscape - 1792x1344 (4:3)": (1792, 1344), "Landscape - 2016x1344 (3:2)": (2016, 1344),
                "Landscape - 2240x1344 (5:3)": (2240, 1344), "Landscape - 2688x1344 (2:1)": (2688, 1344),
                "Landscape - 1792x1456 (16:13)": (1792, 1456), "Landscape - 2912x1456 (2:1)": (2912, 1456),
                "Landscape - 2352x1568 (3:2)": (2352, 1568), "Landscape - 2016x1680 (6:5)": (2016, 1680),
                "Landscape - 2240x1680 (4:3)": (2240, 1680), "Landscape - 2240x1792 (5:4)": (2240, 1792),
            }
            width, height = size_map.get(preset, (1024, 1024))

        elif size_mode == "Custom":
            width = max(8, (width // 8) * 8)
            height = max(8, (height // 8) * 8)

        elif size_mode == "Megapixels":
            w_ratio, h_ratio = map(int, aspect_ratio.split(":"))
            target_pixels = megapixels * 1_000_000
            x = math.sqrt(target_pixels / (w_ratio * h_ratio))
            raw_width = w_ratio * x
            raw_height = h_ratio * x
            width = round(raw_width / scale_factor) * scale_factor
            height = round(raw_height / scale_factor) * scale_factor
            width = max(scale_factor, width)
            height = max(scale_factor, height)

        width = max(8, (width // 8) * 8)
        height = max(8, (height // 8) * 8)

        latent_width = width // scale_factor
        latent_height = height // scale_factor

        device = vae.device if hasattr(vae, 'device') else torch.device('cpu')
        dtype = vae.dtype if hasattr(vae, 'dtype') else torch.float32
        
        latent = torch.zeros(
            [batch_size, latent_channels, latent_height, latent_width],
            device=device,
            dtype=dtype
        )

        return ({"samples": latent}, width, height)


NODE_CLASS_MAPPINGS = {
    "RS_Image_MultiLatent": RS_Image_MultiLatent
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_Image_MultiLatent": "🦊 RS Image MultiLatent"
}