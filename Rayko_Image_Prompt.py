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
from PIL import Image
import folder_paths
from server import PromptServer
from aiohttp import web

WEB_DIRECTORY = "./web"

KNOWN_PROMPT_NODES = {"CLIPTextEncode", "RSPrompts", "RS_ImagePrompt", "PromptStashPassthrough"}
TEXT_KEYS = ["prompt_text", "text", "string", "parameters", "Comment", "Description", "Title"]


def get_image_files():
    input_dir = folder_paths.get_input_directory()
    files = []
    for f in os.listdir(input_dir):
        if os.path.isfile(os.path.join(input_dir, f)) and f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            files.append(f)
    files.sort()
    return files

def _get_text_from_node(prompt_data, node_id, visited):
    node_id = str(node_id)
    if node_id in visited or node_id not in prompt_data:
        return ""
    visited.add(node_id)

    node = prompt_data[node_id]
    inputs = node.get("inputs", {})
    class_type = node.get("class_type", "")

    if inputs.get("enable_text_input"):
        ti = inputs.get("text_input")
        if isinstance(ti, list) and len(ti) >= 1:
            upstream = _get_text_from_node(prompt_data, ti[0], visited)
            if upstream:
                return upstream

    text = inputs.get("text")
    if isinstance(text, str) and text:
        return text

    if class_type == "RS_ImagePrompt":
        prompt_preview = inputs.get("prompt_preview")
        if isinstance(prompt_preview, str) and prompt_preview:
            return prompt_preview

    if class_type == "PromptStashPassthrough":
        if not inputs.get("use_input_text", False):
            prompt_text = inputs.get("prompt_text")
            if isinstance(prompt_text, str) and prompt_text:
                return prompt_text

    for key in ("conditioning", "conditioning_1", "conditioning_2", "clip", "text_input", "text"):
        ref = inputs.get(key)
        if isinstance(ref, list) and len(ref) >= 1:
            result = _get_text_from_node(prompt_data, ref[0], visited)
            if result:
                return result
    return ""


def _extract_prompt_from_dict(prompt_data):
    if not isinstance(prompt_data, dict):
        return ""

    negative_refs = set()
    for node_data in prompt_data.values():
        if not isinstance(node_data, dict):
            continue
        ref = node_data.get("inputs", {}).get("negative")
        if isinstance(ref, list) and len(ref) >= 1:
            negative_refs.add((str(ref[0]), ref[1] if len(ref) > 1 else 0))

    for node_id, node_data in prompt_data.items():
        if not isinstance(node_data, dict):
            continue
        inputs = node_data.get("inputs", {})
        if "positive" in inputs:
            pos_ref = inputs.get("positive")
            if isinstance(pos_ref, list) and pos_ref:
                text = _get_text_from_node(prompt_data, pos_ref[0], set())
                if text:
                    return text

    for node_id, node_data in prompt_data.items():
        if not isinstance(node_data, dict):
            continue
        if node_data.get("class_type", "") in KNOWN_PROMPT_NODES:
            if (str(node_id), 0) in negative_refs:
                continue
            inputs = node_data.get("inputs", {})

            text = inputs.get("text")
            if isinstance(text, str) and text:
                return text

            prompt_preview = inputs.get("prompt_preview")
            if isinstance(prompt_preview, str) and prompt_preview:
                return prompt_preview

            if node_data.get("class_type", "") == "PromptStashPassthrough":
                if not inputs.get("use_input_text", False):
                    prompt_text = inputs.get("prompt_text")
                    if isinstance(prompt_text, str) and prompt_text:
                        return prompt_text

    return ""


def _extract_prompt(prompt_json_str):
    try:
        data = json.loads(prompt_json_str)
    except (json.JSONDecodeError, TypeError):
        return ""
    return _extract_prompt_from_dict(data)

def _extract_prompt_from_workflow(workflow_json_str):
    try:
        wf = json.loads(workflow_json_str)
    except (json.JSONDecodeError, TypeError):
        return ""
    if not isinstance(wf, dict):
        return ""

    nodes = wf.get("nodes", [])
    links = wf.get("links", [])
    if not isinstance(nodes, list):
        return ""

    nodes_by_id = {}
    for n in nodes:
        if isinstance(n, dict) and "id" in n:
            nodes_by_id[str(n["id"])] = n

    link_by_target = {}
    for lk in links:
        if isinstance(lk, list) and len(lk) >= 5:
            link_by_target[(str(lk[3]), lk[4])] = (str(lk[1]), lk[2])

    def widget_text(node):
        wv = node.get("widgets_values", [])
        if isinstance(wv, list) and wv and isinstance(wv[0], str):
            return wv[0]
        return ""

    def trace(node_id, slot_index, visited):
        key = (node_id, slot_index)
        if key in visited:
            return ""
        visited.add(key)
        src = link_by_target.get(key)
        if not src:
            return ""
        src_id, _ = src
        src_node = nodes_by_id.get(src_id)
        if not src_node:
            return ""
        if src_node.get("type", "") in KNOWN_PROMPT_NODES:
            t = widget_text(src_node)
            if t:
                return t
        for idx in range(len(src_node.get("inputs", []))):
            res = trace(src_id, idx, visited)
            if res:
                return res
        return ""

    for nid, node in nodes_by_id.items():
        ntype = str(node.get("type", ""))
        if "ampler" in ntype:
            for idx, inp in enumerate(node.get("inputs", [])):
                if isinstance(inp, dict) and inp.get("name") == "positive":
                    t = trace(nid, idx, set())
                    if t:
                        return t

    for nid, node in nodes_by_id.items():
        if node.get("type", "") in KNOWN_PROMPT_NODES:
            t = widget_text(node)
            if t:
                return t
    return ""

def _looks_like_settings(line):
    keys = ("Steps:", "Sampler:", "CFG scale:", "Seed:", "Size:", "Model hash:",
            "Model:", "Denoising strength:", "Clip skip:", "ENSAM:", "TI_hashes:")
    return any(k in line for k in keys)


def _clean_text_prompt(text):
    if not isinstance(text, str):
        return ""
    text = text.strip()
    if not text:
        return ""

    if text.startswith("{"):
        try:
            data = json.loads(text)
            res = _extract_prompt_from_dict(data)
            if res:
                return res
        except (json.JSONDecodeError, TypeError):
            pass

    idx = text.find("Negative prompt:")
    if idx != -1:
        text = text[:idx]
    lines = text.split("\n")
    while lines and _looks_like_settings(lines[-1]):
        lines.pop()
    return "\n".join(lines).strip()

def _decode_user_comment(data):
    if isinstance(data, str):
        return data
    if not isinstance(data, (bytes, bytearray)):
        return str(data)

    if data.startswith(b"ASCII\x00\x00\x00"):
        return data[8:].decode("latin-1", errors="replace")
    if data.startswith(b"UNICODE\x00"):
        return data[8:].decode("utf-16", errors="replace")
    if data.startswith(b"JIS\x00\x00\x00\x00\x00"):
        return data[8:].decode("shift_jis", errors="replace")

    for encoding in ("utf-8", "latin-1"):
        try:
            return data.decode(encoding)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return data.decode("latin-1", errors="replace")


def _extract_a1111_from_exif(pil_img):
    try:
        exif = pil_img.getexif()
        if not exif:
            return ""
        exif_ifd = exif.get_ifd(0x8769)
        if not exif_ifd:
            return ""
        user_comment = exif_ifd.get(0x9286)
        if not user_comment:
            return ""
        return _decode_user_comment(user_comment)
    except Exception as e:
        print(f"[RS Image-Prompt] EXIF error: {e}")
        return ""

def extract_prompt_from_file(input_path):
    try:
        with Image.open(input_path) as pil_img:
            info = dict(pil_img.info)
            exif_text = _extract_a1111_from_exif(pil_img)
    except Exception as e:
        print(f"[RS Image-Prompt] Cannot open image: {e}")
        return ""

    prompt_json = info.get("prompt", "")
    if prompt_json:
        result = _extract_prompt(prompt_json)
        if result:
            return result

    workflow_json = info.get("workflow", "")
    if workflow_json:
        result = _extract_prompt_from_workflow(workflow_json)
        if result:
            return result

    for key in TEXT_KEYS:
        value = info.get(key)
        if isinstance(value, str) and value.strip():
            result = _clean_text_prompt(value)
            if result:
                return result

    if exif_text:
        result = _clean_text_prompt(exif_text)
        if result:
            return result

    return ""


@PromptServer.instance.routes.get("/rayko/get_prompt")
async def rayko_get_prompt(request):
    filename = request.rel_url.query.get("filename", "")
    if not filename:
        return web.json_response({"prompt": ""})
    try:
        path = folder_paths.get_annotated_filepath(filename)
        return web.json_response({"prompt": extract_prompt_from_file(path)})
    except Exception as e:
        return web.json_response({"prompt": "", "error": str(e)})


class RS_ImagePrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("STRING", {"default": ""}),
                "prompt_preview": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Extracted prompt preview (updates on file select)",
                }),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "process"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Extracts the positive prompt from image metadata (ComfyUI, RS Prompts, RS Image-Prompt, PromptStash, A1111 PNG/JPG/WebP)."

    def process(self, image, prompt_preview=""):
        try:
            input_path = folder_paths.get_annotated_filepath(image)
            if not os.path.exists(input_path):
                raise FileNotFoundError(f"File not found: {input_path}")
            return (extract_prompt_from_file(input_path),)
        except Exception as e:
            print(f"[RS Image-Prompt] Error: {e}")
            import traceback
            traceback.print_exc()
            return ("",)


NODE_CLASS_MAPPINGS = {
    "RS_ImagePrompt": RS_ImagePrompt,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_ImagePrompt": "🦊 RS Image-Prompt",
}