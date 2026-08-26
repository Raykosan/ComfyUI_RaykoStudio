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
import folder_paths

class RSImageLabel:
    NAME = "🦊 RS Image Label"
    CATEGORY = "🦊 RaykoStudio"
    FUNCTION = "noop"
    OUTPUT_NODE = True
    DESCRIPTION = "Transparent floating image label with drag-and-drop support, synced border rounding, and real-time customization."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {"_image_path": ("STRING", {"default": ""})}
        }

    RETURN_TYPES = ()
    OUTPUT_IS_LIST = (False,)

    def noop(self, _image_path=""):
        return {}


@server.PromptServer.instance.routes.get("/rayko/rs_image_label/get_image")
async def get_image(request):
    filename = request.rel_url.query.get("filename", "")
    subfolder = request.rel_url.query.get("subfolder", "")
    folder_type = request.rel_url.query.get("type", "temp")

    if not filename:
        return web.Response(status=400, text="No filename provided")

    try:
        base_dir = folder_paths.get_temp_directory() if folder_type == "temp" else folder_paths.get_output_directory()
        
        filepath = os.path.join(base_dir, subfolder, filename) if subfolder else os.path.join(base_dir, filename)
        filepath = os.path.abspath(filepath)

        if not filepath.startswith(os.path.abspath(base_dir)):
            return web.Response(status=403, text="Access denied")

        if not os.path.isfile(filepath):
            return web.Response(status=404, text="File not found")

        with open(filepath, 'rb') as f:
            data = f.read()

        ext = os.path.splitext(filename)[1].lower()
        content_types = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp'
        }
        ct = content_types.get(ext, 'application/octet-stream')

        return web.Response(body=data, content_type=ct)

    except Exception as e:
        return web.Response(status=500, text=str(e))


NODE_CLASS_MAPPINGS = {"RSImageLabel": RSImageLabel}
NODE_DISPLAY_NAME_MAPPINGS = {"RSImageLabel": "🦊 RS Label Image"}