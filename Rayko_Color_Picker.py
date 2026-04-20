class RSColorPicker:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "color": ("STRING", {"default": "#ff0000", "multiline": False, "tooltip": "Hex color value", "hidden": True}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "noop"
    OUTPUT_NODE = True
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Interactive color picker widget with pipette support"

    def noop(self, color):
        return ()

NODE_CLASS_MAPPINGS = {"RSColorPicker": RSColorPicker}
NODE_DISPLAY_NAME_MAPPINGS = {"RSColorPicker": "🦊 RS Color Picker"}