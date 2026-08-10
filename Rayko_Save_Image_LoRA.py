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
import re
import json

import numpy as np
from PIL import Image, PngImagePlugin

import folder_paths

try:
    from comfy.cli_args import args
    DISABLE_METADATA = args.disable_metadata
except Exception:
    DISABLE_METADATA = False

STRENGTH_WORDS = ("strength", "weight", "wt")
NAME_EXCLUDE_WORDS = ("strength", "weight", "wt", "toggle",
                      "mode", "device", "shift", "type", "data")
IGNORE_CLASS_TYPES = {"RSSaveLoRA"}

def _sanitize(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", str(s))
    return s.strip(" .")

def _clean_lora_name(name: str) -> str:
    name = re.split(r'[\\/]', str(name))[-1]
    return re.sub(r'\.(safetensors|ckpt|pt|bin)$', '', name, flags=re.I)

def _fmt_strength(v) -> str:
    try:
        return f"{float(v):.2f}"
    except (TypeError, ValueError):
        return "?"

def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def _is_link(v) -> bool:
    return isinstance(v, (list, tuple)) and len(v) == 2 and isinstance(v[1], int)

def _resolve_link(prompt: dict, link):
    src = prompt.get(str(link[0]))
    if not src or src.get("class_type") != "PrimitiveNode":
        return None
    val = src.get("inputs", {}).get("value")
    slot = link[1]
    if isinstance(val, list):
        return val[slot] if slot < len(val) else (val[0] if val else None)
    return val

def _read_input(prompt: dict, inputs: dict, key: str):
    v = inputs.get(key)
    if _is_link(v):
        v = _resolve_link(prompt, v)
    return v

def _parse_lora_data(val):
    if isinstance(val, (str, bytes)):
        try:
            val = json.loads(val)
        except (json.JSONDecodeError, ValueError):
            return []
    if isinstance(val, dict):
        val = [val]
    if not isinstance(val, list):
        return []
    out = []
    for item in val:
        if not isinstance(item, dict):
            continue
        if item.get("enabled", True) in (False, 0, "false", "False"):
            continue
        name = (item.get("name") or item.get("lora_name")
                or item.get("model_name") or item.get("path"))
        if not isinstance(name, str) or not name.strip():
            continue
        strength = None
        for sk in ("strength_model", "strength", "weight", "model_strength"):
            v = item.get(sk)
            if _is_number(v):
                strength = v
                break
            if isinstance(v, str):
                try:
                    strength = float(v)
                    break
                except ValueError:
                    pass
        out.append((name.strip(), strength))
    return out

def _resolve_lora_data(prompt: dict, val, depth=0):
    if depth > 5 or not _is_link(val):
        return val
    src = prompt.get(str(val[0]))
    if isinstance(src, dict):
        src_inputs = src.get("inputs", {})
        if "lora_data" in src_inputs:
            return _resolve_lora_data(prompt, src_inputs["lora_data"], depth + 1)
    return val

def _parse_lora_widget(val):
    if not isinstance(val, dict):
        return None
    if "lora" not in val and "name" not in val:
        return None
    if val.get("on", True) in (False, 0):
        return None
    name = val.get("lora") or val.get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    strength = val.get("strength", val.get("strength_model"))
    if not _is_number(strength):
        strength = None
    return (name.strip(), strength)

def _find_strength(prompt: dict, inputs: dict, name_key: str):
    m = re.search(r'(\d+)\s*$', name_key)
    suffix = m.group(1) if m else None
    candidates = []
    for k in inputs:
        kl = k.lower()
        if not any(w in kl for w in STRENGTH_WORDS):
            continue
        if suffix is not None and not kl.endswith(f"_{suffix}"):
            continue
        candidates.append(k)
    candidates.sort(key=lambda k: 0 if "model" in k.lower() else 1)
    for k in candidates:
        v = _read_input(prompt, inputs, k)
        if _is_number(v):
            return v
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                pass
    return None

def find_loras(prompt: dict):
    loras, seen = [], set()
    def add(name, strength):
        name = _clean_lora_name(name)
        key = (name, str(strength))
        if key not in seen:
            seen.add(key)
            loras.append((name, strength))
    for node in prompt.values():
        if not isinstance(node, dict):
            continue
        cls = str(node.get("class_type", ""))
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            continue
        if cls in IGNORE_CLASS_TYPES:
            continue
        if "lora_data" in inputs:
            parsed = _parse_lora_data(_resolve_lora_data(prompt, inputs["lora_data"]))
            for name, strength in parsed:
                add(name, strength)
            continue
        cls_has_lora = "lora" in cls.lower()
        if not cls_has_lora and not any("lora" in k.lower() for k in inputs):
            continue
        for key in inputs:
            kl = key.lower()
            if "lora" not in kl or any(w in kl for w in NAME_EXCLUDE_WORDS):
                continue
            raw = inputs[key]
            if isinstance(raw, dict) and ("lora" in raw or "name" in raw):
                widget = _parse_lora_widget(raw)
                if widget:
                    add(widget[0], widget[1])
                continue
            val = _read_input(prompt, inputs, key)
            if not isinstance(val, str) or not val.strip():
                continue
            add(val.strip(), _find_strength(prompt, inputs, key))
    return loras

class RSSaveLoRA:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"
        self.prefix_append = ""
        self.compress_level = 4

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "filename_prefix": ("STRING", {"default": "ComfyUI"}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    CATEGORY = "🦊 RaykoStudio"
    FUNCTION = "save_images"
    DESCRIPTION = "An image saving node with automatic substitution of the name and power of LoRA in the file name"

    def save_images(self, images, filename_prefix="ComfyUI",
                    prompt=None, extra_pnginfo=None):
        filename_prefix += self.prefix_append
        loras = find_loras(prompt) if prompt else []
        lora_info = "; ".join(
            f"{name} ({_fmt_strength(st)})" for name, st in loras
        )
        if lora_info:
            filename_prefix = f"{filename_prefix}_{_sanitize(lora_info)}"
        full_output_folder, filename, counter, subfolder, filename_prefix = \
            folder_paths.get_save_image_path(
                filename_prefix, self.output_dir,
                images[0].shape[1], images[0].shape[0]
            )
        results = []
        for batch_number, image in enumerate(images):
            i = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            metadata = None
            if not DISABLE_METADATA:
                metadata = PngImagePlugin.PngInfo()
                if prompt is not None:
                    metadata.add_text("prompt", json.dumps(prompt))
                if extra_pnginfo is not None:
                    for x in extra_pnginfo:
                        metadata.add_text(x, json.dumps(extra_pnginfo[x]))
            fn = filename.replace("%batch_num%", str(batch_number))
            file = f"{fn}_{counter:05}_.png"
            img.save(os.path.join(full_output_folder, file),
                     pnginfo=metadata, compress_level=self.compress_level)
            results.append({"filename": file, "subfolder": subfolder,
                            "type": self.type})
        counter += 1
        return {"ui": {"images": results}}

NODE_CLASS_MAPPINGS = {
    "RSSaveLoRA": RSSaveLoRA
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSSaveLoRA": "🦊 RS Save Image LoRA"
}