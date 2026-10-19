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


def resolve_prompt_path(prompt_file):
    if not prompt_file:
        return None
    try:
        file_path = os.path.abspath(
            os.path.join(PROMPT_DIR, prompt_file.replace("/", os.sep))
        )
    except (OSError, ValueError):
        return None

    prompt_root = os.path.abspath(PROMPT_DIR)
    if not file_path.startswith(prompt_root + os.sep):
        return None
    return file_path


@server.PromptServer.instance.routes.get("/rs_system_prompt_dropdown/get_prompts")
async def get_prompts_handler(request):
    return web.json_response({"files": _scan_prompts()})


class RSLoadSystemPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        files = _scan_prompts()
        values = files if files else [""]
        return {
            "required": {
                "prompt_file": ("STRING", {"default": values[0] if values else ""}),
                "prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "placeholder": "Additional prompt text (combined with system prompt)",
                    },
                ),
            },
            "hidden": {
                "selected_file": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("system_prompt", "prompt")
    FUNCTION = "load_system_prompt"
    CATEGORY = "🦊 RaykoStudio"

    @classmethod
    def IS_CHANGED(cls, prompt_file, prompt, selected_file=""):
        target = selected_file or prompt_file
        path = resolve_prompt_path(target)
        if path is None:
            return ""
        try:
            return os.path.getmtime(path)
        except OSError:
            return ""

    def load_system_prompt(self, prompt_file, prompt, selected_file=""):
        target = selected_file or prompt_file
        file_path = resolve_prompt_path(target)

        if file_path is None:
            return ("", prompt or "")

        try:
            with open(file_path, "r", encoding="utf-8-sig") as file:
                text = file.read()
            return (text, prompt or "")
        except (OSError, UnicodeDecodeError) as error:
            return (f"Error reading file: {error}", prompt or "")


NODE_CLASS_MAPPINGS = {
    "RSLoadSystemPrompt": RSLoadSystemPrompt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSLoadSystemPrompt": "🦊 RS Load System Prompt",
}