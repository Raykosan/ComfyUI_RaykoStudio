import random
from decimal import Decimal, ROUND_HALF_UP

print("\033[93m🦊\033[0m \033[93mRaykoStudio - RS Loop Seed \033[92mLOADED\033[0m")

MAX_SEED = 999999999999999


class Rayko_Loop_Seed:
    DESCRIPTION = "Generation of consecutive numbers."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "start_at_step": ("INT", {
                    "default": 0,
                    "min": -10000,
                    "max": 10000,
                    "step": 1,
                }),
                "end_at_step": ("INT", {
                    "default": 10,
                    "min": -10000,
                    "max": 10000,
                    "step": 1,
                }),
                "jump": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 1000,
                    "step": 1,
                })
            }
        }

    RETURN_TYPES = ("INT",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "generate"
    CATEGORY = "🦊 RaykoStudio"

    def generate(self, start_at_step: int, end_at_step: int, jump: int):
        if jump <= 0:
            raise ValueError("Jump must be greater than 0.")
        values = []
        current = start_at_step
        while current <= end_at_step:
            values.append(current)
            current += jump
        return (values,)

    @classmethod
    def IS_CHANGED(cls, start_at_step, end_at_step, jump):
        return f"{start_at_step}_{end_at_step}_{jump}"

    @classmethod
    def DISPLAY_NAME(cls):
        return "🦊 RS Loop Seed"

NODE_CLASS_MAPPINGS = {
    "Rayko_Loop_Seed": Rayko_Loop_Seed,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Rayko_Loop_Seed": "🦊 RS Loop Seed",
}
