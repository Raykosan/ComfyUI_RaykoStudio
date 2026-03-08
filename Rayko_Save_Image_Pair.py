import torch
import numpy as np
from PIL import Image, PngImagePlugin
import json
import os
import folder_paths

print("\033[93m🦊\033[0m \033[93mRaykoStudio - RS Save Image Pair \033[92mLOADED\033[0m")

class SaveImagePair:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"
        self.prefix_append = ""
        self.compress_level = 4

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "reference": ("IMAGE",),          # первое изображение (референс)
                "final": ("IMAGE",),              # второе изображение (финальное)
                "filename_prefix": ("STRING", {"default": "ComfyUI"}),
                "concat_type": (["horizontal", "vertical"], {"default": "horizontal"}),
                "fill_color": (["black", "white"], {"default": "black"}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images_pair"
    OUTPUT_NODE = True
    CATEGORY = "🦊 RaykoStudio/Image"

    def save_images_pair(self, reference, final, filename_prefix="ComfyUI", concat_type="horizontal",
                         fill_color="black", prompt=None, extra_pnginfo=None):
        filename_prefix += self.prefix_append

        # Проверка батчей
        batch_ref = reference.shape[0]
        batch_fin = final.shape[0]
        if batch_ref != batch_fin:
            min_batch = min(batch_ref, batch_fin)
            print(f"Warning: Batch sizes differ ({batch_ref} vs {batch_fin}). Using first {min_batch} images.")
            reference = reference[:min_batch]
            final = final[:min_batch]
        else:
            min_batch = batch_ref

        # Определяем цвет фона
        if fill_color == "black":
            bg_color = (0, 0, 0)
        else:  # white
            bg_color = (255, 255, 255)

        combined_images = []
        for i in range(min_batch):
            # Конвертация тензоров в PIL Image
            img_ref = Image.fromarray((reference[i].cpu().numpy() * 255).astype(np.uint8))
            img_fin = Image.fromarray((final[i].cpu().numpy() * 255).astype(np.uint8))

            # Автоматическое выравнивание с добавлением полей (padding)
            if concat_type == "horizontal":
                # Выравнивание по высоте
                target_h = max(img_ref.height, img_fin.height)
                if img_ref.height != target_h:
                    new_ref = Image.new("RGB", (img_ref.width, target_h), bg_color)
                    new_ref.paste(img_ref, (0, (target_h - img_ref.height) // 2))
                    img_ref = new_ref
                if img_fin.height != target_h:
                    new_fin = Image.new("RGB", (img_fin.width, target_h), bg_color)
                    new_fin.paste(img_fin, (0, (target_h - img_fin.height) // 2))
                    img_fin = new_fin
            else:  # vertical
                # Выравнивание по ширине
                target_w = max(img_ref.width, img_fin.width)
                if img_ref.width != target_w:
                    new_ref = Image.new("RGB", (target_w, img_ref.height), bg_color)
                    new_ref.paste(img_ref, ((target_w - img_ref.width) // 2, 0))
                    img_ref = new_ref
                if img_fin.width != target_w:
                    new_fin = Image.new("RGB", (target_w, img_fin.height), bg_color)
                    new_fin.paste(img_fin, ((target_w - img_fin.width) // 2, 0))
                    img_fin = new_fin

            # Склейка
            if concat_type == "horizontal":
                new_img = np.concatenate((np.array(img_ref), np.array(img_fin)), axis=1)
            else:
                new_img = np.concatenate((np.array(img_ref), np.array(img_fin)), axis=0)

            combined_images.append(new_img)

        # Преобразуем обратно в тензор
        combined_tensor = torch.from_numpy(np.stack(combined_images, axis=0)).float() / 255.0

        # Сохранение (как в стандартном SaveImage)
        full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(
            filename_prefix, self.output_dir, combined_tensor[0].shape[1], combined_tensor[0].shape[0])

        results = []
        for img_tensor in combined_tensor:
            img_np = (img_tensor.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
            img_pil = Image.fromarray(img_np)

            metadata = PngImagePlugin.PngInfo()
            if prompt is not None:
                metadata.add_text("prompt", json.dumps(prompt))
            if extra_pnginfo is not None:
                for key, value in extra_pnginfo.items():
                    metadata.add_text(key, json.dumps(value))

            file = f"{filename}_{counter:05}_.png"
            img_pil.save(os.path.join(full_output_folder, file), pnginfo=metadata, compress_level=self.compress_level)
            results.append({
                "filename": file,
                "subfolder": subfolder,
                "type": self.type
            })
            counter += 1

        return {"ui": {"images": results}}

NODE_CLASS_MAPPINGS = {
    "SaveImagePair": SaveImagePair,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SaveImagePair": "🦊 RS Save Image Pair",
}