import os
import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2

print("\033[93m🦊\033[0m \033[93mRaykoStudio - RS RusTextOverlay \033[92mLOADED\033[0m")

class RS_RusTextOverlay:
    """Класс для наложения русского текста на изображения"""
    
    @classmethod
    def INPUT_TYPES(cls):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        fonts_dir = os.path.join(os.path.dirname(current_dir), "fonts")

        font_list = []
        if os.path.exists(fonts_dir):
            for f in os.listdir(fonts_dir):
                if f.lower().endswith(('.ttf', '.otf')):
                    font_list.append(f)

        if not font_list:
            font_list = ["default"]
            print("RS_RusTextOverlay: No fonts found, using default")

        return {
            "required": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "text": ("STRING", {
                    "default": "Текст\nс переносом\tи табуляцией",
                    "multiline": True
                }),
                "font_name": (font_list, {"default": font_list[0]}),
                "text_color": ("COLOR", {"default": "#FFFFFF"}),
                "text_opacity": ("INT", {"default": 100, "min": 0, "max": 100}),
                "min_font_size": ("INT", {"default": 8, "min": 1, "max": 500}),
                "padding": ("INT", {"default": 5, "min": 0, "max": 100}),
                "vertical_align": (["top", "center", "bottom"], {"default": "center"}),
                "horizontal_align": (["left", "center", "right"], {"default": "center"}),
                "rotate_with_mask": ("BOOLEAN", {"default": True}),
                "line_spacing": ("FLOAT", {"default": 1.0, "min": 0.5, "max": 3.0, "step": 0.1}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "apply_text"
    CATEGORY = "🦊 RaykoStudio/Image"

    def apply_text(self, image, mask, text, font_name, text_color, text_opacity, min_font_size, padding, vertical_align, horizontal_align, rotate_with_mask, line_spacing):
        try:
            image_pil = Image.fromarray((image[0].cpu().numpy() * 255).astype(np.uint8), 'RGB')
            mask_pil = Image.fromarray((mask[0].cpu().numpy() * 255).astype(np.uint8), 'L')
            
            bbox = mask_pil.getbbox()
            if not bbox:
                return (image,)
                
            x1, y1, x2, y2 = bbox
            mask_width = x2 - x1 - 2*padding
            mask_height = y2 - y1 - 2*padding

            if font_name != "default":
                font_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts", font_name)
                font = self.find_optimal_font(font_path, text, mask_width, mask_height, min_font_size)
            else:
                font = ImageFont.load_default()

            alpha = int((text_opacity / 100.0) * 255)
            if text_color.startswith('#'):
                text_color = text_color[1:]
            r = int(text_color[0:2], 16)
            g = int(text_color[2:4], 16)
            b = int(text_color[4:6], 16)
            text_color_rgba = (r, g, b, alpha)

            text_layer = Image.new("RGBA", image_pil.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(text_layer)
            
            lines = text.split('\n')
            line_heights = []
            line_widths = []
            for line in lines:
                line = line.replace('\t', '    ')
                text_bbox = draw.textbbox((0, 0), line, font=font)
                line_widths.append(text_bbox[2] - text_bbox[0])
                line_heights.append(int((text_bbox[3] - text_bbox[1]) * line_spacing))
            
            total_text_height = sum(line_heights)
            max_text_width = max(line_widths)

            if rotate_with_mask:
                mask_np = np.array(mask_pil)
                contours, _ = cv2.findContours(mask_np, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if contours:
                    contour = max(contours, key=cv2.contourArea)
                    points = contour.reshape(-1, 2).astype(np.float32)
                    mean = np.mean(points, axis=0)
                    cov = np.cov(points.T)
                    eigenvalues, eigenvectors = np.linalg.eigh(cov)
                    main_axis = eigenvectors[:, np.argmax(eigenvalues)]
                    angle = np.arctan2(main_axis[1], main_axis[0]) * 180 / np.pi

                    leftmost = points[np.argmin(points[:, 0])]
                    rightmost = points[np.argmax(points[:, 0])]
                    direction_vector = rightmost - leftmost
                    direction_angle = np.arctan2(direction_vector[1], direction_vector[0]) * 180 / np.pi

                    angle_diff = (direction_angle - angle) % 360
                    if angle_diff > 90 and angle_diff < 270:
                        angle += 180
                        angle = angle % 360

                    if 90 < angle <= 270:
                        angle += 180
                    angle = angle % 360

                    angle = -angle

                    temp_size = int(max(max_text_width, total_text_height) * 3)
                    temp_text = Image.new("RGBA", (temp_size, temp_size), (0, 0, 0, 0))
                    temp_draw = ImageDraw.Draw(temp_text)

                    center_x, center_y = temp_size // 2, temp_size // 2
                    current_y = center_y - total_text_height // 2
                    for line, line_height, line_width in zip(lines, line_heights, line_widths):
                        line = line.replace('\t', '    ')
                        pos_x = center_x - line_width // 2
                        temp_draw.text((pos_x, current_y), line, font=font, fill=text_color_rgba, anchor="lt")
                        current_y += line_height

                    rotated_text = temp_text.rotate(angle, center=(center_x, center_y), resample=Image.BICUBIC, expand=False)
                    rot_bbox = rotated_text.getbbox()
                    if rot_bbox:
                        rot_width = rot_bbox[2] - rot_bbox[0]
                        rot_height = rot_bbox[3] - rot_bbox[1]
                        mask_center_x = (x1 + x2) / 2
                        mask_center_y = (y1 + y2) / 2
                        paste_x = int(mask_center_x - rot_width / 2)
                        paste_y = int(mask_center_y - rot_height / 2)
                        text_layer.paste(rotated_text.crop(rot_bbox), (paste_x, paste_y), rotated_text.crop(rot_bbox))
                    else:
                        print("Ошибка: не удалось определить bounding box повернутого текста")
            else:
                if vertical_align == "top":
                    current_y = y1 + padding
                elif vertical_align == "bottom":
                    current_y = y2 - total_text_height - padding
                else:
                    current_y = y1 + (mask_height - total_text_height) // 2 + padding

                for line, line_height, line_width in zip(lines, line_heights, line_widths):
                    line = line.replace('\t', '    ')
                    pos_x = {"left": x1 + padding, "right": x2 - line_width - padding, "center": x1 + (mask_width - line_width) // 2 + padding}[horizontal_align]
                    draw.text((pos_x, current_y), line, font=font, fill=text_color_rgba, anchor="lt")
                    current_y += line_height
            
            result = Image.alpha_composite(image_pil.convert("RGBA"), text_layer).convert("RGB")
            return (torch.from_numpy(np.array(result).astype(np.float32) / 255.0).unsqueeze(0),)
            
        except Exception as e:
            print(f"Ошибка в RS_RusTextOverlay: {str(e)}")
            return (image,)

    def find_optimal_font(self, font_path, text, max_width, max_height, min_size):
        temp_img = Image.new("RGB", (max_width, max_height))
        draw = ImageDraw.Draw(temp_img)
        
        lines = text.split('\n')
        for size in range(500, min_size - 1, -1):
            try:
                font = ImageFont.truetype(font_path, size)
                fits = True
                total_height = 0
                max_line_width = 0
                for line in lines:
                    line = line.replace('\t', '    ')
                    bbox = draw.textbbox((0, 0), line, font=font)
                    line_width = bbox[2] - bbox[0]
                    line_height = bbox[3] - bbox[1]
                    total_height += line_height
                    max_line_width = max(max_line_width, line_width)
                    if line_width > max_width:
                        fits = False
                        break
                if fits and total_height <= max_height:
                    return font
            except Exception as e:
                print(f"RS_RusTextOverlay: Failed to load font {font_path} with size {size}: {str(e)}")
                continue
        return ImageFont.load_default()

NODE_CLASS_MAPPINGS = {
    "RS_RusTextOverlay": RS_RusTextOverlay
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_RusTextOverlay": "🦊 RS RusTextOverlay"
}