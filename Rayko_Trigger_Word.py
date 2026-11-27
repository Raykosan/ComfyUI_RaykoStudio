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

class RS_TriggerWord:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "prompt": ("STRING", {"forceInput": True}),
                "trigger_word": ("STRING", {"default": "", "multiline": True}),
                "delimiter": ([". ", ", ", ": ", "; ", "- ", "_ ", "> "], {"default": ". "}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("PROMPT",)
    FUNCTION = "process"
    CATEGORY = "🦊 RaykoStudio"

    def process(self, prompt, trigger_word, delimiter):
        trigger_word = trigger_word.strip()
        prompt = prompt.strip() if prompt else ""
        
        if not trigger_word:
            result = prompt
        elif not prompt:
            result = trigger_word
        else:
            result = f"{trigger_word}{delimiter}{prompt}"
            
        return (result,)


NODE_CLASS_MAPPINGS = {
    "RS_TriggerWord": RS_TriggerWord
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_TriggerWord": "🦊 RS Trigger Word"
}