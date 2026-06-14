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

from __future__ import annotations
from typing import Any, Dict, Tuple

class RSAnySwitch:
    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        inputs = {
            "required": {},
            "optional": {
                "active_input": ("STRING", {"default": "input_1", "hidden": True}),
            }
        }
        for i in range(1, 21):
            inputs["optional"][f"input_{i}"] = ("*",)
        return inputs

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch_input"
    CATEGORY = "🦊 RaykoStudio"

    def switch_input(self, active_input: str, **kwargs) -> Tuple[Any]:
        if active_input in kwargs and kwargs[active_input] is not None:
            return (kwargs[active_input],)
        for i in range(1, 21):
            key = f"input_{i}"
            if key in kwargs and kwargs[key] is not None:
                return (kwargs[key],)
        return (None,)

NODE_CLASS_MAPPINGS = {
    "RSAnySwitch": RSAnySwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSAnySwitch": "🦊 RS Any Switch",
}