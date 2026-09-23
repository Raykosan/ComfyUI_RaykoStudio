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
import time
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import folder_paths
import torch
from server import PromptServer
from aiohttp import web


class RS_VAE_Decode_Save:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.last_temp_file = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "samples": ("LATENT",),
                "vae": ("VAE",),
                "save_path": ("STRING", {"default": ""}),
                "file_prefix": ("STRING", {"default": "img"}),
                "format": (["png", "jpg", "webp"], {"default": "png"}),
                "node_data": ("STRING", {"default": "{}", "multiline": False}),
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
    DESCRIPTION = (
        "Combines native VAE Decode and Save Image into a single node. "
        "Write boundary: by default only ComfyUI's output directory is "
        "writable; additional roots can be enabled via the "
        "RS_EXTRA_OUTPUT_ROOTS environment variable (path-separator-delimited)."
    )

    PNG_COMPRESSION = 1
    JPG_QUALITY = 90
    WEBP_QUALITY = 90
    EMBED_WORKFLOW = True

    # ------------------------------------------------------------------
    # Path handling / output-directory boundary
    # ------------------------------------------------------------------

    @staticmethod
    def _sanitize_path_component(component: str) -> str:
        """
        Convenience sanitizer for *relative* subfolder names.

        This is NOT a security boundary. It only cleans up cosmetic issues
        (backslashes, redundant "./", filesystem-illegal characters).
        The actual write-boundary is enforced by `_resolve_target_dir()`.
        """
        if not isinstance(component, str):
            component = str(component)
        component = component.replace("\\", "/")
        while "../" in component or "./" in component:
            component = component.replace("../", "").replace("./", "")
        component = re.sub(r'[<>:"|?*]', '_', component)
        return component.strip()

    def _get_allowed_roots(self) -> list:
        """
        Return the list of directories this node is allowed to write into.

        Always includes ComfyUI's output directory. Additional roots can be
        enabled at runtime via the RS_EXTRA_OUTPUT_ROOTS environment variable
        (path-separator-delimited, i.e. os.pathsep) or via comfy.options.
        """
        roots = {os.path.realpath(self.output_dir)}

        env = os.environ.get("RS_EXTRA_OUTPUT_ROOTS", "")
        for part in env.split(os.pathsep):
            part = part.strip()
            if part:
                roots.add(os.path.realpath(part))

        try:
            import comfy.options  # type: ignore
            extra = getattr(comfy.options, "rs_extra_output_roots", None) or []
            for part in extra:
                if isinstance(part, str) and part.strip():
                    roots.add(os.path.realpath(part.strip()))
        except Exception:
            pass

        return sorted(roots)

    @staticmethod
    def _is_within(candidate: str, roots) -> bool:
        """
        True if realpath(candidate) lies inside one of the given roots.

        Uses os.path.commonpath, which is the correct containment primitive
        on both POSIX and Windows (unlike str.startswith, which has
        prefix-collision bugs such as /out vs /output-evil).
        """
        real = os.path.realpath(candidate)
        for root in roots:
            try:
                if os.path.commonpath([real, root]) == root:
                    return True
            except ValueError:
                # Different drives on Windows.
                continue
        return False

    def _resolve_target_dir(self, requested: str) -> str:
        """
        Resolve the user-provided save path into a safe absolute directory.

        Enforces the write boundary: the resolved path must lie inside one of
        the roots returned by `_get_allowed_roots()`. Raises PermissionError
        otherwise.
        """
        allowed = self._get_allowed_roots()
        requested = (requested or "").strip()

        is_absolute = os.path.isabs(requested) or (
            len(requested) > 1 and requested[1] == ":"
        )

        if not requested:
            candidate = self.output_dir
        elif is_absolute:
            candidate = os.path.normpath(requested)
        else:
            safe = self._sanitize_path_component(requested)
            candidate = (
                os.path.join(self.output_dir, safe) if safe else self.output_dir
            )

        if not self._is_within(candidate, allowed):
            raise PermissionError(
                f"[RS] Refusing to write outside allowed roots. "
                f"Requested: {requested!r}. "
                f"Allowed roots: {allowed}. "
                f"Set RS_EXTRA_OUTPUT_ROOTS to allow additional locations."
            )

        return os.path.realpath(candidate)

    # ------------------------------------------------------------------
    # Image normalization
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_images(images):
        images = images.squeeze()
        if images.dim() == 2:
            images = images.unsqueeze(0).unsqueeze(-1)
        if images.dim() == 3:
            if images.shape[-1] in [1, 3, 4]:
                images = images.unsqueeze(0)
            else:
                images = images.unsqueeze(-1)
        if images.dim() == 4:
            b, h, w, c = images.shape
            if c not in [1, 3, 4]:
                if images.shape[1] in [1, 3, 4]:
                    images = images.permute(0, 2, 3, 1)
        if images.dim() == 5:
            if images.shape[1] == 1:
                images = images.squeeze(1)
            elif images.shape[0] == 1:
                images = images.squeeze(0)
            else:
                images = images.reshape(
                    images.shape[0], -1, images.shape[-2], images.shape[-1]
                )
        if images.dim() != 4:
            try:
                images = images.view(
                    images.shape[0], images.shape[-2], images.shape[-1], -1
                )
            except Exception:
                raise ValueError(
                    f"[RS] Cannot normalize tensor with shape: {images.shape}"
                )
        if images.shape[-1] == 1:
            images = images.repeat(1, 1, 1, 3)
        if images.dtype != torch.float32:
            images = images.float()
        images = torch.clamp(images, 0.0, 1.0)
        return images

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_next_counter(self, directory: str, prefix: str, extension: str) -> int:
        try:
            pattern = re.compile(
                rf'^{re.escape(prefix)}_(\d{{5}})\.{re.escape(extension)}$'
            )
            max_num = 0
            if os.path.exists(directory):
                for f in os.listdir(directory):
                    match = pattern.match(f)
                    if match:
                        num = int(match.group(1))
                        if num > max_num:
                            max_num = num
            return max_num + 1
        except Exception:
            return 1

    def _cleanup_temp(self):
        try:
            temp_dir = folder_paths.get_temp_directory()
            if not os.path.exists(temp_dir):
                return

            now = time.time()
            cutoff = now - 7200

            for filename in os.listdir(temp_dir):
                if filename.startswith("rs_prev_"):
                    filepath = os.path.join(temp_dir, filename)
                    try:
                        if os.path.getmtime(filepath) < cutoff:
                            os.remove(filepath)
                    except Exception:
                        pass
        except Exception as e:
            print(f"[RS] Cleanup error: {e}")

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def decode_and_save(self, samples, vae, save_path, file_prefix, format, node_data,
                        prompt=None, extra_pnginfo=None):
        images = vae.decode(samples["samples"])
        images = self._normalize_images(images)

        self._cleanup_temp()

        target_dir = self._resolve_target_dir(save_path)

        try:
            os.makedirs(target_dir, exist_ok=True)
        except Exception as e:
            raise PermissionError(
                f"[RS] Cannot create directory: {target_dir}. Error: {e}"
            )

        safe_prefix = self._sanitize_path_component(file_prefix)
        if not safe_prefix:
            safe_prefix = "img"

        batch_size = images.shape[0]
        ext_map = {"png": "png", "jpg": "jpg", "webp": "webp"}
        extension = ext_map.get(format, "png")

        start_counter = self._get_next_counter(target_dir, safe_prefix, extension)

        saved_files = []
        temp_dir = folder_paths.get_temp_directory()

        if self.last_temp_file and os.path.exists(
            os.path.join(temp_dir, self.last_temp_file)
        ):
            try:
                os.remove(os.path.join(temp_dir, self.last_temp_file))
            except Exception:
                pass

        for i in range(batch_size):
            current_counter = start_counter + i
            filename_main = f"{safe_prefix}_{current_counter:05}.{extension}"
            filepath_main = os.path.join(target_dir, filename_main)

            img_array = np.clip(
                255.0 * images[i].cpu().numpy(), 0, 255
            ).astype(np.uint8)
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
            elif format == "webp":
                save_kwargs["quality"] = self.WEBP_QUALITY
                save_kwargs["method"] = 4

            img.save(filepath_main, **save_kwargs)

            temp_name = f"rs_prev_{int(time.time() * 1000)}_{i}.png"
            filepath_temp = os.path.join(temp_dir, temp_name)
            img.save(filepath_temp, compress_level=1)

            if i == batch_size - 1:
                self.last_temp_file = temp_name

            saved_files.append({
                "filename": temp_name,
                "subfolder": "",
                "type": "temp",
            })

        return {"ui": {"images": saved_files}, "result": (images,)}


@PromptServer.instance.routes.get("/rs_folders")
async def get_output_folders(request):
    try:
        output_dir = folder_paths.get_output_directory()
        subfolders = []
        if os.path.exists(output_dir):
            for item in os.listdir(output_dir):
                full_path = os.path.join(output_dir, item)
                if os.path.isdir(full_path):
                    real_path = os.path.realpath(full_path)
                    real_output = os.path.realpath(output_dir)
                    if (
                        real_path.startswith(real_output + os.sep)
                        or real_path == real_output
                    ):
                        subfolders.append(item)
        return web.json_response({"subfolders": sorted(subfolders)})
    except Exception as e:
        return web.json_response({"subfolders": [], "error": str(e)}, status=500)


NODE_CLASS_MAPPINGS = {
    "RS_VAE_Decode_Save": RS_VAE_Decode_Save,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_VAE_Decode_Save": "🦊 RS Decode Save Image",
}