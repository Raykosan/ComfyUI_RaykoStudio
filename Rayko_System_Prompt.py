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
import server
from aiohttp import web


NODE_DIR = os.path.dirname(os.path.abspath(__file__))
PROMPT_DIR = os.path.join(NODE_DIR, "system_prompts")

ROUTE_GET_LIST = "/rs_system_prompt_dropdown/get_prompts"
ROUTE_GET_CONTENT = "/rs_system_prompt_dropdown/get_prompt_content"
ROUTE_SAVE = "/rs_system_prompt_dropdown/save_prompt"


def ensure_prompt_dir():
    try:
        os.makedirs(PROMPT_DIR, exist_ok=True)
        return os.path.isdir(PROMPT_DIR)
    except OSError as error:
        print(f"[RSLoadSystemPrompt] Cannot create prompt dir '{PROMPT_DIR}': {error}")
        return False


def _scan_prompts():
    if not ensure_prompt_dir():
        return []

    files = []
    for root, _, filenames in os.walk(PROMPT_DIR):
        for filename in filenames:
            if filename.lower().endswith(".txt"):
                full_path = os.path.join(root, filename)
                relative_path = os.path.relpath(full_path, PROMPT_DIR)
                files.append(relative_path.replace(os.sep, "/"))

    files.sort(key=str.casefold)
    return files


def resolve_prompt_path(prompt_file, must_exist=False):
    if not prompt_file:
        return None
    try:
        rel = prompt_file.replace("\\", "/").replace("/", os.sep)
        file_path = os.path.abspath(os.path.join(PROMPT_DIR, rel))
    except (OSError, ValueError):
        return None

    prompt_root = os.path.abspath(PROMPT_DIR)
    if not file_path.startswith(prompt_root + os.sep):
        return None
    if file_path == prompt_root:
        return None
    if must_exist and not os.path.isfile(file_path):
        return None
    return file_path


@server.PromptServer.instance.routes.get(ROUTE_GET_LIST)
async def get_prompts_handler(request):
    return web.json_response({"files": _scan_prompts()})


@server.PromptServer.instance.routes.get(ROUTE_GET_CONTENT)
async def get_prompt_content_handler(request):
    filename = request.query.get("file", "")
    file_path = resolve_prompt_path(filename, must_exist=True)
    if file_path is None:
        return web.json_response(
            {"ok": False, "error": "File not found or invalid path"},
            status=404,
        )
    try:
        with open(file_path, "r", encoding="utf-8-sig") as file:
            content = file.read()
        return web.json_response({"ok": True, "content": content})
    except (OSError, UnicodeDecodeError) as error:
        return web.json_response(
            {"ok": False, "error": f"Error reading file: {error}"},
            status=500,
        )


@server.PromptServer.instance.routes.post(ROUTE_SAVE)
async def save_prompt_handler(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response(
            {"ok": False, "error": "Invalid JSON body"},
            status=400,
        )

    filename = (data or {}).get("filename", "")
    content = (data or {}).get("content", "")

    if not isinstance(filename, str) or not isinstance(content, str):
        return web.json_response(
            {"ok": False, "error": "filename and content must be strings"},
            status=400,
        )

    filename = filename.strip().replace("\\", "/")
    if not filename:
        return web.json_response(
            {"ok": False, "error": "Empty file name"},
            status=400,
        )

    if not filename.lower().endswith(".txt"):
        filename += ".txt"

    if not ensure_prompt_dir():
        return web.json_response(
            {"ok": False, "error": "Cannot access system_prompts directory"},
            status=500,
        )

    file_path = resolve_prompt_path(filename)
    if file_path is None:
        return web.json_response(
            {"ok": False, "error": "Invalid path"},
            status=400,
        )

    created = not os.path.exists(file_path)

    try:
        parent = os.path.dirname(file_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
    except OSError as error:
        return web.json_response(
            {"ok": False, "error": f"Cannot create folder: {error}"},
            status=500,
        )

    try:
        with open(file_path, "w", encoding="utf-8", newline="\n") as file:
            file.write(content)
    except OSError as error:
        return web.json_response(
            {"ok": False, "error": f"Error writing file: {error}"},
            status=500,
        )

    rel_path = os.path.relpath(file_path, PROMPT_DIR).replace(os.sep, "/")
    return web.json_response(
        {"ok": True, "path": rel_path, "created": created}
    )


ROUTE_DELETE = "/rs_system_prompt_dropdown/delete_prompt"


@server.PromptServer.instance.routes.post(ROUTE_DELETE)
async def delete_prompt_handler(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response(
            {"ok": False, "error": "Invalid JSON body"},
            status=400,
        )

    filename = (data or {}).get("filename", "")
    if not isinstance(filename, str) or not filename.strip():
        return web.json_response(
            {"ok": False, "error": "Empty file name"},
            status=400,
        )

    file_path = resolve_prompt_path(filename.strip(), must_exist=True)
    if file_path is None:
        return web.json_response(
            {"ok": False, "error": "File not found or invalid path"},
            status=404,
        )

    try:
        os.remove(file_path)
    except OSError as error:
        return web.json_response(
            {"ok": False, "error": f"Error deleting file: {error}"},
            status=500,
        )

    return web.json_response({"ok": True, "path": filename.strip()})


class RSLoadSystemPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "system_prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "placeholder": "Pick a file above or type a system prompt here",
                    },
                ),
                "prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "placeholder": "Additional user prompt",
                    },
                ),
            },
            "hidden": {
                "prompt_file": ("STRING", {"default": ""}),
                "selected_file": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("system_prompt", "prompt")
    FUNCTION = "load_system_prompt"
    CATEGORY = "🦊 RaykoStudio"

    def load_system_prompt(self, system_prompt, prompt, prompt_file="", selected_file=""):
        return (system_prompt or "", prompt or "")


NODE_CLASS_MAPPINGS = {
    "RSLoadSystemPrompt": RSLoadSystemPrompt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSLoadSystemPrompt": "🦊 RS Load System Prompt",
}
