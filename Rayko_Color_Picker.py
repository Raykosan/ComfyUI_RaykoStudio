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

import json
import os
import server
from aiohttp import web

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PRESETS_DIR = os.path.join(CURRENT_DIR, "preset_colors")

if not os.path.exists(PRESETS_DIR):
    os.makedirs(PRESETS_DIR)

class RSColorPicker:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_data": ("STRING", {
                    "default": "{}",
                    "hidden": True
                }),
            },
        }
    
    RETURN_TYPES = ("INT", "STRING", "STRING")
    RETURN_NAMES = ("HEX_INT", "HEX_STR", "RGB")
    FUNCTION = "get_color"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Professional color picker node with advanced features including eyedropper and color history"
    
    def get_color(self, node_data="{}"):
        try:
            data = json.loads(node_data) if node_data else {}
            color = data.get("color", "#ff0000")
        except Exception:
            color = "#ff0000"
        
        hex_value = color.lstrip('#')
        if len(hex_value) > 6:
            hex_value = hex_value[:6]
        elif len(hex_value) < 6:
            hex_value = hex_value.ljust(6, '0')
            
        int_value = int(hex_value, 16)
        hex_str = '#' + hex_value.upper()
        
        r = int(hex_value[0:2], 16) / 255.0
        g = int(hex_value[2:4], 16) / 255.0
        b = int(hex_value[4:6], 16) / 255.0
        
        rgb_str = f"{r:.3f}, {g:.3f}, {b:.3f}"
        
        return (int_value, hex_str, rgb_str)

@server.PromptServer.instance.routes.post("/rs_colorpicker_save_preset")
async def rs_colorpicker_save_preset(request):
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        if not name:
            return web.json_response({"error": "Name required"}, status=400)
        
        name = "".join(c for c in name if c.isalnum() or c in " _-").strip()
        if not name:
            return web.json_response({"error": "Invalid name"}, status=400)
        
        filepath = os.path.join(PRESETS_DIR, f"{name}.json")
        preset_data = {
            "color": data.get("color", "#ff0000"),
            "history": data.get("history", [])
        }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(preset_data, f, indent=2)
        
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/rs_colorpicker_list_presets")
async def rs_colorpicker_list_presets(request):
    try:
        presets = []
        if os.path.exists(PRESETS_DIR):
            presets = [f[:-5] for f in os.listdir(PRESETS_DIR) if f.endswith('.json')]
        return web.json_response(sorted(presets, key=lambda x: x.lower()))
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/rs_colorpicker_load_preset")
async def rs_colorpicker_load_preset(request):
    try:
        data = await request.json()
        name = data.get("name")
        if not name:
            return web.json_response({"error": "Name required"}, status=400)
        
        filepath = os.path.join(PRESETS_DIR, f"{name}.json")
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return web.json_response(json.load(f))
        return web.json_response({"error": "Preset not found"}, status=404)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/rs_colorpicker_delete_preset")
async def rs_colorpicker_delete_preset(request):
    try:
        data = await request.json()
        name = data.get("name")
        if not name:
            return web.json_response({"error": "Name required"}, status=400)
        
        filepath = os.path.join(PRESETS_DIR, f"{name}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            return web.json_response({"success": True})
        return web.json_response({"error": "Preset not found"}, status=404)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

NODE_CLASS_MAPPINGS = {
    "RSColorPicker": RSColorPicker
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSColorPicker": "🦊 RS Color Picker"
}