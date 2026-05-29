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

import random
import os

MAX_SEED = 9888888888888888

WEB_DIRECTORY = "./web"

class RaykoLoopSwitchSeed:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "start_at_step": ("INT", {"default": 1, "min": -10000, "max": 10000, "step": 1}),
                "end_at_step": ("INT", {"default": 10, "min": -10000, "max": 10000, "step": 1}),
                "jump": ("INT", {"default": 1, "min": 1, "max": 1000, "step": 1}),
                "control_before_generate": (["fixed", "increment", "decrement", "randomize"],),
                "value_1": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
                "value_2": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
                "value_3": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
                "value_4": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
                "value_5": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
                "value_6": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
                "value_7": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
                "value_8": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
                "value_9": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
                "value_10": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
            }
        }

    RETURN_TYPES = ("INT",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "process"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True

    def process(self, start_at_step, end_at_step, jump, control_before_generate, 
                value_1, value_2, value_3, value_4, value_5, 
                value_6, value_7, value_8, value_9, value_10):
        
        values = [value_1, value_2, value_3, value_4, value_5, 
                  value_6, value_7, value_8, value_9, value_10]
        
        if control_before_generate == "randomize":
            values = [random.randint(0, MAX_SEED) for _ in range(10)]
        elif control_before_generate == "increment":
            values = [(v + 1) % (MAX_SEED + 1) for v in values]
        elif control_before_generate == "decrement":
            values = [(v - 1) % (MAX_SEED + 1) for v in values]

        if jump <= 0:
            raise ValueError("Jump must be greater than 0.")
        
        output_values = []
        current_step = start_at_step
        while current_step <= end_at_step:
            index = (current_step - 1) % 10
            output_values.append(values[index])
            current_step += jump

        return {
            "ui": {
                "value_1": [values[0]],
                "value_2": [values[1]],
                "value_3": [values[2]],
                "value_4": [values[3]],
                "value_5": [values[4]],
                "value_6": [values[5]],
                "value_7": [values[6]],
                "value_8": [values[7]],
                "value_9": [values[8]],
                "value_10": [values[9]],
            },
            "result": (output_values,)
        }

    @classmethod
    def IS_CHANGED(cls, start_at_step, end_at_step, jump, control_before_generate,
                   value_1, value_2, value_3, value_4, value_5, 
                   value_6, value_7, value_8, value_9, value_10):
        if control_before_generate in ["randomize", "increment", "decrement"]:
            return float("NaN")
        return (f"{start_at_step}_{end_at_step}_{jump}_{control_before_generate}_"
                f"{value_1}_{value_2}_{value_3}_{value_4}_{value_5}_"
                f"{value_6}_{value_7}_{value_8}_{value_9}_{value_10}")

NODE_CLASS_MAPPINGS = {"RaykoLoopSwitchSeed": RaykoLoopSwitchSeed}
NODE_DISPLAY_NAME_MAPPINGS = {"RaykoLoopSwitchSeed": "🦊 RS Loop Switch"}