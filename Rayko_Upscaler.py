import torch
import comfy.utils
import comfy.model_management
import folder_paths


class RSUpscaler:
    """
    🦊 RS Upscaler
    Комбинирует загрузку модели и апскейл в одной ноде.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                # Эти виджеты будут скрыты JS и заменены на кастомные
                "upscale_model": (folder_paths.get_filename_list("upscale_models"),),
                "upscale_method": (["nearest-exact", "bilinear", "area", "bicubic", "lanczos"],),
                "upscale_x": ("FLOAT", {"default": 2.0, "min": 0.1, "max": 8.0, "step": 0.05}),
            },
            "hidden": {
                # Маркер для JS-расширения
                "rs_node_type": ("STRING", {"default": "RSUpscaler"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "upscale"
    CATEGORY = "🦊 RaykoStudio"

    def upscale(self, image, upscale_model, upscale_method, upscale_x, rs_node_type=None):
        # 1. Загрузка модели
        model_path = folder_paths.get_full_path("upscale_models", upscale_model)

        try:
            sd = comfy.utils.load_torch_file(model_path, safe_load=True)
            from comfy_extras.chainner_models import model_loading

            is_chainner = False
            for key in sd.keys():
                if "module.layers" in key or "model.0.weight" in key or "conv_first.weight" in key:
                    is_chainner = True
                    break

            if is_chainner:
                upscale_model_obj = model_loading.load_state_dict(sd).eval()
            else:
                raise ValueError("Не удалось определить архитектуру модели")

        except Exception as e:
            raise ValueError(
                f"Ошибка загрузки модели '{upscale_model}': {str(e)}\n"
                f"Убедитесь, что файл является корректной upscale-моделью"
            )

        # 2. Применение модели с тайлингом
        device = comfy.model_management.get_torch_device()
        upscale_model_obj.to(device)

        in_img = image.movedim(-1, -3).to(device)
        scale = upscale_model_obj.scale

        upscaled_tensor = comfy.utils.tiled_scale(
            in_img,
            lambda a: upscale_model_obj(a),
            tile_x=192,
            tile_y=192,
            overlap=8,
            upscale_amount=scale
        )

        upscale_model_obj.cpu()
        comfy.model_management.soft_empty_cache()

        upscaled = torch.clamp(upscaled_tensor.movedim(-3, -1), min=0, max=1.0)

        # 3. Финальный ресайз
        orig_height = image.shape[1]
        orig_width = image.shape[2]

        target_width = int(orig_width * upscale_x)
        target_height = int(orig_height * upscale_x)

        if upscaled.shape[2] != target_width or upscaled.shape[1] != target_height:
            samples = upscaled.movedim(-1, 1)
            s = comfy.utils.common_upscale(samples, target_width, target_height, upscale_method, crop="disabled")
            result = s.movedim(1, -1)
        else:
            result = upscaled

        return (result,)


NODE_CLASS_MAPPINGS = {
    "RSUpscaler": RSUpscaler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSUpscaler": "🦊 RS Upscaler",
}