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

class RSColorPicker:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "color": ("STRING", {"default": "#ff0000"}),
            },
        }
    
    RETURN_TYPES = ("INT", "STRING", "STRING")
    RETURN_NAMES = ("HEX_INT", "HEX_STR", "RGB")
    FUNCTION = "get_color"
    CATEGORY = "🦊 RaykoStudio"
    
    def get_color(self, color):
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

NODE_CLASS_MAPPINGS = {
    "RSColorPicker": RSColorPicker
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSColorPicker": "🦊 RS Color Picker"
}