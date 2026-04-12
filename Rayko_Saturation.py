import torch
from comfy.model_patcher import ModelPatcher

class RS_SaturationSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "intensity": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 3.0,
                    "step": 0.05,
                    "display_name": "Intensity",
                    "description": "0.0=Grayscale, 1.0=Original, 1.5=Subtle Boost"
                }),
            },
        }
    
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "apply_saturation"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Artifact-free saturation control with proper tensor handling"

    def apply_saturation(self, image, intensity):
        if intensity == 1.0:
            return (image,)
            
        img = image.clone().float()
        
        r, g, b = img[..., 0], img[..., 1], img[..., 2]
        l = 0.299 * r + 0.587 * g + 0.114 * b
        l = l.unsqueeze(-1)
        
        if intensity < 1.0:
            result = l + intensity * (img - l)
        else:
            boost = 1.0 + (intensity - 1.0) * 0.7
            delta = img - l
            result = l + boost * delta
            
            result = torch.where(
                (result < 0) | (result > 1),
                l + 0.9 * delta,
                result
            )
        
        if result.dim() == 3:
            result = result.unsqueeze(0)
            
        return (result.clamp(0, 1).to(image.dtype),)

NODE_CLASS_MAPPINGS = {"RS_Saturation": RS_SaturationSwitch}
NODE_DISPLAY_NAME_MAPPINGS = {"RS_Saturation": "🦊 RS Saturation"}