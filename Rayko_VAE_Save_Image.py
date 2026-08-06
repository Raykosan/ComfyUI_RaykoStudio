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

import os
import json
import numpy as np
import re
from datetime import datetime
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import folder_paths
import torch


class RS_VAE_Decode_Save:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "samples": ("LATENT",),
                "vae": ("VAE",),
                "filename_prefix": ("STRING", {"default": "ComfyUI"}),
                "format": (["png", "jpg", "webp"], {"default": "png"}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "decode_and_save"
    OUTPUT_NODE = True
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Combines native VAE Decode and Save Image into a single node."

    PNG_COMPRESSION = 1
    JPG_QUALITY = 90
    WEBP_QUALITY = 90
    EMBED_WORKFLOW = True
    OVERWRITE_EXISTING = False

    @staticmethod
    def _sanitize_path_component(component: str) -> str:
        """Sanitizes a string to be safe for use in file paths."""
        if not isinstance(component, str):
            component = str(component)
        component = component.replace("\\", "/")
        while "../" in component or "./" in component:
            component = component.replace("../", "").replace("./", "")
        if os.path.isabs(component):
            component = os.path.basename(component)
        component = re.sub(r'[<>:"|?*]', '_', component)
        if not component.strip():
            component = "sanitized_empty"
        return component.strip()

    @staticmethod
    def _normalize_images(images):
        while images.dim() > 4 and images.shape[0] == 1:
            images = images.squeeze(0)
        if images.dim() == 2:
            images = images.unsqueeze(0).unsqueeze(-1)
        if images.dim() == 3:
            images = images.unsqueeze(0)
        if images.dim() != 4:
            raise ValueError(f"[RS] Unexpected tensor dims: {images.shape}")
        b, d1, d2, d3 = images.shape
        second_is_ch = d1 in (1, 3, 4) and d3 not in (1, 3, 4)
        last_is_ch = d3 in (1, 3, 4) and d1 not in (1, 3, 4)
        if second_is_ch and not last_is_ch:
            images = images.permute(0, 2, 3, 1)
        elif d1 == 1 and d3 > 4:
            images = images.squeeze(1).unsqueeze(-1)
        if images.shape[-1] == 1:
            images = images.repeat(1, 1, 1, 3)
        if images.dtype != torch.float32:
            images = images.float()
        images = torch.clamp(images, 0.0, 1.0)
        return images

    def _get_next_filename(self, directory, base_name, extension, is_batch, batch_index=None):
        try:
            safe_base_name = self._sanitize_path_component(base_name)
            safe_extension = self._sanitize_path_component(extension).lower()

            test_path = os.path.join(directory, f"{safe_base_name}.{safe_extension}")
            real_dir = os.path.realpath(directory)
            real_path = os.path.realpath(test_path)

            if not real_path.startswith(real_dir + os.sep) and real_path != real_dir:
                print(f"[RS] Security Warning: Path traversal detected in '{base_name}'. Falling back to safe name.")
                safe_base_name = "unsafe_input_sanitized"

            if self.OVERWRITE_EXISTING:
                if is_batch and batch_index is not None:
                    return os.path.join(directory, f"{safe_base_name}_{batch_index:03d}.{safe_extension}")
                return os.path.join(directory, f"{safe_base_name}_001.{safe_extension}")

            if is_batch and batch_index is not None:
                base_with_index = f"{safe_base_name}_{batch_index:03d}"
                pattern = re.compile(rf'^{re.escape(base_with_index)}_(\d+)\.{re.escape(safe_extension)}$')
            else:
                pattern = re.compile(rf'^{re.escape(safe_base_name)}_(\d+)\.{re.escape(safe_extension)}$')

            max_num = 0
            if os.path.exists(directory):
                for f in os.listdir(directory):
                    match = pattern.match(f)
                    if match:
                        num = int(match.group(1))
                        if num > max_num:
                            max_num = num

            next_num = max_num + 1
            if is_batch and batch_index is not None:
                filename = f"{safe_base_name}_{batch_index:03d}_{next_num:03d}.{safe_extension}"
            else:
                filename = f"{safe_base_name}_{next_num:03d}.{safe_extension}"

            return os.path.join(directory, filename)
        except Exception as e:
            print(f"[RS] Filename error: {e}")
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            return os.path.join(directory, f"error_fallback_{ts}.png")

    def _build_workflow_json(self, prompt, extra_pnginfo):
        try:
            if extra_pnginfo and 'workflow' in extra_pnginfo:
                wf = extra_pnginfo['workflow']
                if 'prompt' not in wf:
                    wf['prompt'] = prompt
                return wf
            return {"prompt": prompt or {}, "workflow_info": "Generated by RS Decode Save"}
        except Exception as e:
            print(f"[RS] Workflow JSON error: {e}")
            return {"prompt": prompt or {}}

    def _save_workflow_json(self, image_path, workflow_data):
        try:
            json_path = os.path.splitext(image_path)[0] + ".json"
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(workflow_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[RS] Workflow JSON save error: {e}")

    def _save_single(self, image_tensor, save_dir, base_filename, fmt,
                     prompt, extra_pnginfo, is_batch, batch_index=None):
        try:
            ext_map = {"png": "png", "jpg": "jpg", "webp": "webp"}
            extension = ext_map.get(fmt, "png")
            filepath = self._get_next_filename(save_dir, base_filename, extension, is_batch, batch_index)
            img_array = np.clip(255.0 * image_tensor.cpu().numpy(), 0, 255).astype(np.uint8)
            img = Image.fromarray(img_array)
            save_kwargs = {}
            if fmt == "png":
                save_kwargs["compress_level"] = self.PNG_COMPRESSION
                if self.EMBED_WORKFLOW and prompt:
                    metadata = PngInfo()
                    metadata.add_text("prompt", json.dumps(prompt))
                    if extra_pnginfo:
                        for key, value in extra_pnginfo.items():
                            try:
                                metadata.add_text(key, json.dumps(value))
                            except Exception:
                                pass
                    save_kwargs["pnginfo"] = metadata
            elif fmt == "jpg":
                save_kwargs["quality"] = self.JPG_QUALITY
                save_kwargs["optimize"] = True
                save_kwargs["progressive"] = True
                if self.EMBED_WORKFLOW and (prompt or extra_pnginfo):
                    self._save_workflow_json(filepath, self._build_workflow_json(prompt, extra_pnginfo))
            elif fmt == "webp":
                save_kwargs["quality"] = self.WEBP_QUALITY
                save_kwargs["method"] = 4
                if self.EMBED_WORKFLOW and (prompt or extra_pnginfo):
                    self._save_workflow_json(filepath, self._build_workflow_json(prompt, extra_pnginfo))
            img.save(filepath, **save_kwargs)
            return filepath
        except Exception as e:
            print(f"[RS] Save error: {e}")
            return ""

    def decode_and_save(self, samples, vae, filename_prefix, format,
                        prompt=None, extra_pnginfo=None):
        images = vae.decode(samples["samples"])
        images = self._normalize_images(images)

        safe_prefix = self._sanitize_path_component(filename_prefix)

        full_output_folder, fn_prefix, counter, subfolder, _ = \
            folder_paths.get_save_image_path(safe_prefix, self.output_dir,
                                             images[0].shape[1], images[0].shape[0])

        batch_size = images.shape[0]
        is_batch = batch_size > 1
        ext_map = {"png": "png", "jpg": "jpg", "webp": "webp"}
        extension = ext_map.get(format, "png")

        saved_files = []
        for i in range(batch_size):
            batch_index = i + 1 if is_batch else None

            file_counter = counter + i
            filename = f"{fn_prefix}_{file_counter:05}.{extension}"
            filepath = os.path.join(full_output_folder, filename)

            img_array = np.clip(255.0 * images[i].cpu().numpy(), 0, 255).astype(np.uint8)
            img = Image.fromarray(img_array)

            save_kwargs = {}
            if format == "png":
                save_kwargs["compress_level"] = self.PNG_COMPRESSION
                if self.EMBED_WORKFLOW and prompt:
                    metadata = PngInfo()
                    metadata.add_text("prompt", json.dumps(prompt))
                    if extra_pnginfo:
                        for key, value in extra_pnginfo.items():
                            try:
                                metadata.add_text(key, json.dumps(value))
                            except Exception:
                                pass
                    save_kwargs["pnginfo"] = metadata
            elif format == "jpg":
                save_kwargs["quality"] = self.JPG_QUALITY
                save_kwargs["optimize"] = True
                save_kwargs["progressive"] = True
                if self.EMBED_WORKFLOW and (prompt or extra_pnginfo):
                    self._save_workflow_json(filepath, self._build_workflow_json(prompt, extra_pnginfo))
            elif format == "webp":
                save_kwargs["quality"] = self.WEBP_QUALITY
                save_kwargs["method"] = 4
                if self.EMBED_WORKFLOW and (prompt or extra_pnginfo):
                    self._save_workflow_json(filepath, self._build_workflow_json(prompt, extra_pnginfo))

            img.save(filepath, **save_kwargs)

            saved_files.append({
                "filename": filename,
                "subfolder": subfolder,
                "type": "output"
            })

        return {"ui": {"images": saved_files}, "result": (images,)}


NODE_CLASS_MAPPINGS = {
    "RS_VAE_Decode_Save": RS_VAE_Decode_Save,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_VAE_Decode_Save": "🦊 RS Decode Save",
}