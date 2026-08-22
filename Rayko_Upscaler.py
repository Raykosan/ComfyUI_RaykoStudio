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
import comfy.utils
import comfy.model_management
import folder_paths


class RSUpscaler:
    @classmethod
    def INPUT_TYPES(cls):
        model_list = folder_paths.get_filename_list("upscale_models")
        default_model = model_list[0] if model_list else ""

        return {
            "required": {
                "image": ("IMAGE",),
                "upscale_model": (model_list, {"default": default_model}),
                "upscale_method": (["nearest-exact", "bilinear", "area", "bicubic", "lanczos"], {"default": "nearest-exact"}),
                "upscale_x": ("FLOAT", {"default": 2.0, "min": 0.1, "max": 8.0, "step": 0.05}),
            },
            "hidden": {
                "rs_node_type": ("STRING", {"default": "RSUpscaler"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "upscale"
    CATEGORY = "🦊 RaykoStudio"

    @classmethod
    def VALIDATE_INPUTS(cls, upscale_model, upscale_method, upscale_x, **kwargs):
        model_list = folder_paths.get_filename_list("upscale_models")

        if not upscale_model or upscale_model not in model_list:
            if model_list:
                return True
            return "No upscale models found in models/upscale_models/"

        valid_methods = ["nearest-exact", "bilinear", "area", "bicubic", "lanczos"]
        if upscale_method not in valid_methods:
            return True

        return True

    def upscale(self, image, upscale_model, upscale_method, upscale_x, rs_node_type=None):
        model_list = folder_paths.get_filename_list("upscale_models")
        if not upscale_model or upscale_model not in model_list:
            if model_list:
                upscale_model = model_list[0]
            else:
                raise ValueError("No upscale models found in models/upscale_models/")

        model_path = folder_paths.get_full_path("upscale_models", upscale_model)

        try:
            from spandrel import ModelLoader

            sd = comfy.utils.load_torch_file(model_path, safe_load=True)
            upscale_model_obj = ModelLoader().load_from_state_dict(sd).eval()
        except ImportError:
            try:
                from comfy_extras.chainner_models import model_loading

                sd = comfy.utils.load_torch_file(model_path, safe_load=True)
                upscale_model_obj = model_loading.load_state_dict(sd).eval()
            except Exception as e:
                raise ValueError(
                    f"Failed to load model '{upscale_model}': {str(e)}\n"
                    f"Could not load via spandrel or chainner_models"
                )
        except Exception as e:
            raise ValueError(
                f"Failed to load model '{upscale_model}': {str(e)}\n"
                f"Make sure the file is a valid upscale model (ESRGAN/RealESRGAN/SwinIR)"
            )

        device = comfy.model_management.get_torch_device()
        upscale_model_obj.to(device)

        in_img = image.movedim(-1, -3).to(device)
        scale = upscale_model_obj.scale

        upscaled_tensor = comfy.utils.tiled_scale(
            in_img,
            lambda a: upscale_model_obj(a),
            tile_x=192,
            tile_y=192,
            overlap=8,
            upscale_amount=scale
        )

        upscale_model_obj.cpu()
        comfy.model_management.soft_empty_cache()

        upscaled = torch.clamp(upscaled_tensor.movedim(-3, -1), min=0, max=1.0)

        orig_height = image.shape[1]
        orig_width = image.shape[2]

        target_width = int(orig_width * upscale_x)
        target_height = int(orig_height * upscale_x)

        if upscaled.shape[2] != target_width or upscaled.shape[1] != target_height:
            samples = upscaled.movedim(-1, 1)
            s = comfy.utils.common_upscale(samples, target_width, target_height, upscale_method, crop="disabled")
            result = s.movedim(1, -1)
        else:
            result = upscaled

        return (result,)


NODE_CLASS_MAPPINGS = {
    "RSUpscaler": RSUpscaler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSUpscaler": "🦊 RS Upscaler",
}