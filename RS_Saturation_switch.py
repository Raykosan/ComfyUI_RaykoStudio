import torch
from comfy.model_patcher import ModelPatcher

print("\033[93m🦊\033[0m \033[93mRaykoStudio - RS SaturationNode \033[92mLOADED\033[0m")

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
                    "step": 0.05,  # Шаг изменения 0.05
                    "display_name": "Intensity",
                    "description": "0.0=Grayscale, 1.0=Original, 1.5=Subtle Boost"
                }),
            },
        }
    
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "apply_saturation"
    CATEGORY = "🦊 RaykoStudio/Image"
    DESCRIPTION = "Artifact-free saturation control with proper tensor handling"

    def apply_saturation(self, image, intensity):
        if intensity == 1.0:
            return (image,)
            
        # Создаем копию с явным указанием размерности
        img = image.clone().float()  # Конвертируем в float32 для точности
        
        # Рассчитываем luminance (яркость)
        r, g, b = img[..., 0], img[..., 1], img[..., 2]
        l = 0.299 * r + 0.587 * g + 0.114 * b
        l = l.unsqueeze(-1)  # Добавляем размерность канала
        
        # Безопасное изменение насыщенности
        if intensity < 1.0:
            # Для уменьшения насыщенности - линейная интерполяция
            result = l + intensity * (img - l)
        else:
            # Для увеличения - нелинейное усиление с защитой
            boost = 1.0 + (intensity - 1.0) * 0.7  # Мягкое усиление
            delta = img - l
            result = l + boost * delta
            
            # Ограничение для предотвращения артефактов
            result = torch.where(
                (result < 0) | (result > 1),
                l + 0.9 * delta,  # Безопасный коэффициент
                result
            )
        
        # Корректное восстановление размерности
        if result.dim() == 3:
            result = result.unsqueeze(0)
            
        return (result.clamp(0, 1).to(image.dtype),)

NODE_CLASS_MAPPINGS = {"RS_SaturationSwitch": RS_SaturationSwitch}
NODE_DISPLAY_NAME_MAPPINGS = {"RS_SaturationSwitch": "🦊 RS Safe Saturation"}