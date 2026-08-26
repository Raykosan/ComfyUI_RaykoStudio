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
from server import PromptServer
from aiohttp import web


class RSLabel:
    NAME = "🦊 RS Label"
    CATEGORY = "🦊 RaykoStudio"
    FUNCTION = "noop"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()

    def noop(self):
        return ()


def _get_font_list() -> list:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    fonts_dir = os.path.join(current_dir, "fonts")
    font_list = []

    if os.path.isdir(fonts_dir):
        for f in sorted(os.listdir(fonts_dir)):
            if f.lower().endswith(('.ttf', '.otf')):
                font_list.append(f)

    return [f for f in font_list if os.path.basename(f) == f]


@PromptServer.instance.routes.get("/rayko/rs_label/get_fonts")
async def get_fonts_handler(request):
    try:
        font_list = _get_font_list()
        return web.json_response({"font_list": font_list})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/rayko/rs_label/font/{filename}")
async def serve_font_handler(request):
    filename = request.match_info['filename']
    current_dir = os.path.dirname(os.path.abspath(__file__))
    fonts_dir = os.path.join(current_dir, "fonts")
    filepath = os.path.join(fonts_dir, filename)

    if not os.path.isfile(filepath) or os.path.commonpath([filepath, fonts_dir]) != fonts_dir:
        raise web.HTTPNotFound()

    return web.FileResponse(filepath)


NODE_CLASS_MAPPINGS = {"RSLabel": RSLabel}
NODE_DISPLAY_NAME_MAPPINGS = {"RSLabel": "🦊 RS Label"}