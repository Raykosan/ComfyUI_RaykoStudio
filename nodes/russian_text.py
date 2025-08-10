import os
import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2
import math

print("\033[93m🦊\033[0m \033[93mRaykoStudio - RS RusTextOverlay \033[92mLOADED\033[0m")

class RS_RusTextOverlay:
    
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
                    "default": "Текст\nс переносом",
                    "multiline": True
                }),
                "font_name": (font_list, {"default": font_list[0]}),
                "text_color": ("COLOR", {"default": "#FFFFFF"}),
                "use_gradient": ("BOOLEAN", {"default": False}),
                "direction": (["horizontal", "vertical", "diagonal"], {"default": "horizontal"}),
                "start_color": ("COLOR", {"default": "#FFFFFF"}),
                "end_color": ("COLOR", {"default": "#000000"}),
                "outline_thickness": ("INT", {"default": 0, "min": 0, "max": 50}),
                "outline_color": ("COLOR", {"default": "#000000"}),
                "rotate_with_mask": ("BOOLEAN", {"default": True}),
                "text_opacity": ("INT", {"default": 100, "min": 0, "max": 100}),
                "min_font_size": ("INT", {"default": 8, "min": 1, "max": 500}),
                "padding": ("INT", {"default": 5, "min": 0, "max": 100}),
                "vertical_align": (["top", "center", "bottom"], {"default": "center"}),
                "horizontal_align": (["left", "center", "right"], {"default": "center"}),
                "line_spacing": ("FLOAT", {"default": 1.0, "min": 0.5, "max": 3.0, "step": 0.1}),
                "letter_spacing": ("FLOAT", {"default": 0.0, "min": -20.0, "max": 100.0, "step": 0.5}),
                "text_orientation": (["horizontal", "vertical"], {"default": "horizontal"}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "apply_text"
    CATEGORY = "🦊 RaykoStudio/Image"

    def hex_to_rgba(self, hex_color, alpha=255):
        if hex_color.startswith('#'):
            hex_color = hex_color[1:]
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return (r, g, b, alpha)

    def draw_text_with_outline(self, draw, position, text, font, text_color, start_color, end_color, outline_color, thickness, 
                              letter_spacing, use_gradient, direction, total_width, total_height, current_y_offset, angle, text_orientation):
        x, y = position
        if thickness > 0:
            for dx in range(-thickness, thickness + 1):
                for dy in range(-thickness, thickness + 1):
                    if dx != 0 or dy != 0:
                        if text_orientation == "horizontal":
                            current_x = x + dx
                            for char in text:
                                draw.text((current_x, y + dy), char, font=font, fill=outline_color)
                                char_width = draw.textlength(char, font=font)
                                current_x += char_width + letter_spacing
                        else:  # vertical
                            current_y = y + dy
                            for char in text:
                                draw.text((x + dx, current_y), char, font=font, fill=outline_color)
                                char_bbox = draw.textbbox((x, current_y), char, font=font)
                                char_height = char_bbox[3] - char_bbox[1]
                                current_y += char_height + letter_spacing

        if text_orientation == "horizontal":
            current_x = x
            if use_gradient and text:
                text_width = draw.textlength(text, font=font) + letter_spacing * max(0, len(text) - 1)
                text_bbox = draw.textbbox((x, y), text, font=font)
                text_height = text_bbox[3] - text_bbox[1]

                angle_rad = math.radians(angle)

                for i, char in enumerate(text):
                    char_width = draw.textlength(char, font=font)
                    char_bbox = draw.textbbox((current_x, y), char, font=font)
                    char_height = char_bbox[3] - char_bbox[1]
                    char_top = char_bbox[1]

                    rel_x = (current_x - x) + char_width / 2 - text_width / 2
                    rel_y = current_y_offset + (char_top + char_height / 2 - text_bbox[1]) - total_height / 2

                    rotated_x = rel_x * math.cos(angle_rad) + rel_y * math.sin(angle_rad)
                    rotated_y = -rel_x * math.sin(angle_rad) + rel_y * math.cos(angle_rad)

                    if direction == "horizontal":
                        t = (rotated_x + text_width / 2) / text_width if text_width > 0 else 0
                    elif direction == "vertical":
                        t = (rotated_y + total_height / 2) / total_height if total_height > 0 else 0
                    else:  # diagonal
                        t_h = (rotated_x + text_width / 2) / text_width if text_width > 0 else 0
                        t_v = (rotated_y + total_height / 2) / total_height if total_height > 0 else 0
                        t = (t_h + t_v) / 2

                    t = max(0, min(1, t))
                    r = int(start_color[0] + (end_color[0] - start_color[0]) * t)
                    g = int(start_color[1] + (end_color[1] - start_color[1]) * t)
                    b = int(start_color[2] + (end_color[2] - start_color[2]) * t)
                    a = start_color[3]
                    char_color = (r, g, b, a)
                    draw.text((current_x, y), char, font=font, fill=char_color)
                    current_x += char_width + letter_spacing
            else:
                draw.text((current_x, y), text, font=font, fill=text_color)
        else:  # vertical
            current_y = y
            if use_gradient and text:
                text_bbox = draw.textbbox((x, y), text[0], font=font)
                char_height = text_bbox[3] - text_bbox[1]
                text_height = (char_height + letter_spacing) * len(text)
                text_width = draw.textlength(text[0], font=font)

                angle_rad = math.radians(angle)

                for i, char in enumerate(text):
                    char_bbox = draw.textbbox((x, current_y), char, font=font)
                    char_width = draw.textlength(char, font=font)
                    char_height = char_bbox[3] - char_bbox[1]
                    char_left = char_bbox[0]

                    rel_y = (current_y - y) + char_height / 2 - text_height / 2
                    rel_x = (char_left + char_width / 2 - x) - text_width / 2

                    rotated_x = rel_x * math.cos(angle_rad) + rel_y * math.sin(angle_rad)
                    rotated_y = -rel_x * math.sin(angle_rad) + rel_y * math.cos(angle_rad)

                    if direction == "horizontal":
                        t = (rotated_x + text_width / 2) / text_width if text_width > 0 else 0
                    elif direction == "vertical":
                        t = (rotated_y + text_height / 2) / text_height if text_height > 0 else 0
                    else:  # diagonal
                        t_h = (rotated_x + text_width / 2) / text_width if text_width > 0 else 0
                        t_v = (rotated_y + text_height / 2) / text_height if text_height > 0 else 0
                        t = (t_h + t_v) / 2

                    t = max(0, min(1, t))
                    r = int(start_color[0] + (end_color[0] - start_color[0]) * t)
                    g = int(start_color[1] + (end_color[1] - start_color[1]) * t)
                    b = int(start_color[2] + (end_color[2] - start_color[2]) * t)
                    a = start_color[3]
                    char_color = (r, g, b, a)
                    draw.text((x, current_y), char, font=font, fill=char_color)
                    current_y += char_height + letter_spacing
            else:
                for char in text:
                    draw.text((x, current_y), char, font=font, fill=text_color)
                    char_bbox = draw.textbbox((x, current_y), char, font=font)
                    char_height = char_bbox[3] - char_bbox[1]
                    current_y += char_height + letter_spacing

    def apply_text(self, image, mask, text, font_name, use_gradient, text_color, text_opacity, start_color, end_color, 
                   direction, outline_color, outline_thickness, min_font_size, padding, 
                   vertical_align, horizontal_align, rotate_with_mask, line_spacing, letter_spacing, text_orientation):
        try:
            print("Converting image and mask to PIL format...")
            image_pil = Image.fromarray((image[0].cpu().numpy() * 255).astype(np.uint8), 'RGB')
            mask_pil = Image.fromarray((mask[0].cpu().numpy() * 255).astype(np.uint8), 'L')
            
            print("Getting mask bounding box...")
            bbox = mask_pil.getbbox()
            if not bbox:
                print("No bounding box found in mask, returning original image.")
                return (image,)
            
            x1, y1, x2, y2 = bbox
            mask_width = x2 - x1 - 2 * padding
            mask_height = y2 - y1 - 2 * padding
            print(f"Mask bbox: {bbox}, width: {mask_width}, height: {mask_height}")

            if font_name != "default":
                font_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts", font_name)
                print(f"Loading font from {font_path}")
                font = self.find_optimal_font(font_path, text, mask_width, mask_height, min_font_size, letter_spacing, line_spacing, outline_thickness, text_orientation)
            else:
                print("Using default font")
                font = ImageFont.load_default()

            alpha = int((text_opacity / 100.0) * 255)
            text_color_rgba = self.hex_to_rgba(text_color, alpha)
            start_color = self.hex_to_rgba(start_color, alpha)
            end_color = self.hex_to_rgba(end_color, alpha)
            outline_color_rgba = self.hex_to_rgba(outline_color, alpha)
            print(f"Text color: {text_color_rgba}, Start color: {start_color}, End color: {end_color}, Outline color: {outline_color_rgba}")

            text_layer = Image.new("RGBA", image_pil.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(text_layer)
            
            if text_orientation == "horizontal":
                lines = text.split('\n')
            else:
                lines = ["".join(text.split('\n'))]  # Combine all text into one line for vertical mode
            line_heights = []
            line_widths = []
            for line in lines:
                line = line.replace('\t', '    ')
                if text_orientation == "horizontal":
                    text_bbox = draw.textbbox((0, 0), line, font=font)
                    char_count = len(line)
                    line_width = draw.textlength(line, font=font) + letter_spacing * max(0, char_count - 1) + outline_thickness * 2
                    line_heights.append(int((text_bbox[3] - text_bbox[1]) * line_spacing + outline_thickness * 2))
                else:
                    char_count = len(line)
                    text_bbox = draw.textbbox((0, 0), line[0] if line else " ", font=font)
                    char_height = text_bbox[3] - text_bbox[1]
                    line_width = draw.textlength(line[0] if line else " ", font=font) + outline_thickness * 2
                    line_heights.append((char_height + letter_spacing) * char_count + outline_thickness * 2)
                line_widths.append(line_width)
            
            total_text_height = sum(line_heights)
            max_text_width = max(line_widths)
            print(f"Text dimensions: width={max_text_width}, height={total_text_height}")

            if max_text_width > mask_width or total_text_height > mask_height:
                print("Text exceeds mask boundaries, adjusting font size...")
                font = self.find_optimal_font(font_path, text, mask_width, mask_height, min_font_size, letter_spacing, line_spacing, outline_thickness, text_orientation)
                line_heights = []
                line_widths = []
                for line in lines:
                    line = line.replace('\t', '    ')
                    if text_orientation == "horizontal":
                        text_bbox = draw.textbbox((0, 0), line, font=font)
                        char_count = len(line)
                        line_width = draw.textlength(line, font=font) + letter_spacing * max(0, char_count - 1) + outline_thickness * 2
                        line_heights.append(int((text_bbox[3] - text_bbox[1]) * line_spacing + outline_thickness * 2))
                    else:
                        char_count = len(line)
                        text_bbox = draw.textbbox((0, 0), line[0] if line else " ", font=font)
                        char_height = text_bbox[3] - text_bbox[1]
                        line_width = draw.textlength(line[0] if line else " ", font=font) + outline_thickness * 2
                        line_heights.append((char_height + letter_spacing) * char_count + outline_thickness * 2)
                    line_widths.append(line_width)
                total_text_height = sum(line_heights)
                max_text_width = max(line_widths)
                print(f"Adjusted text dimensions: width={max_text_width}, height={total_text_height}")

            temp_size = int(max(max_text_width, total_text_height) * 3)
            temp_text = Image.new("RGBA", (temp_size, temp_size), (0, 0, 0, 0))
            temp_draw = ImageDraw.Draw(temp_text)
            center_x, center_y = temp_size // 2, temp_size // 2
            current_y = center_y - total_text_height // 2
            y_offset = 0

            if rotate_with_mask:
                print("Calculating rotation angle...")
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
                else:
                    angle = 0
            else:
                angle = 0
            print(f"Text rotation angle: {angle} degrees")

            for line, line_height, line_width in zip(lines, line_heights, line_widths):
                line = line.replace('\t', '    ')
                pos_x = center_x - line_width // 2
                self.draw_text_with_outline(temp_draw, (pos_x, current_y), line, font, 
                                          text_color_rgba, start_color, end_color, outline_color_rgba, outline_thickness, 
                                          letter_spacing, use_gradient, direction, 
                                          total_width=max_text_width, total_height=total_text_height, 
                                          current_y_offset=y_offset, angle=angle, text_orientation=text_orientation)
                current_y += line_height
                y_offset += line_height

            if rotate_with_mask:
                print("Applying text with rotation...")
            else:
                print("Applying text without rotation...")
            rotated_text = temp_text.rotate(angle, center=(center_x, center_y), resample=Image.BICUBIC, expand=False)
            rot_bbox = rotated_text.getbbox()
            if rot_bbox:
                rot_width = rot_bbox[2] - rot_bbox[0]
                rot_height = rot_bbox[3] - rot_bbox[1]
                mask_center_x = (x1 + x2) / 2
                mask_center_y = (y1 + y2) / 2

                rot_width = min(rot_width, mask_width)
                rot_height = min(rot_height, mask_height)

                if rotate_with_mask:
                    paste_x = int(mask_center_x - rot_width / 2)
                    paste_y = int(mask_center_y - rot_height / 2)
                else:
                    paste_x = int(x1 + (mask_width - rot_width) / 2 + padding) if horizontal_align == "center" else \
                             int(x1 + padding) if horizontal_align == "left" else int(x2 - rot_width - padding)
                    paste_y = int(y1 + padding) if vertical_align == "top" else \
                             int(y2 - rot_height - padding) if vertical_align == "bottom" else \
                             int(y1 + (mask_height - rot_height) / 2 + padding)
                
                print(f"Rotated text dimensions: width={rot_width}, height={rot_height}")
                print(f"Paste position: x={paste_x}, y={paste_y}")
                text_layer.paste(rotated_text.crop(rot_bbox), (paste_x, paste_y), rotated_text.crop(rot_bbox))
            else:
                print("Ошибка: не удалось определить bounding box текста")

            print("Compositing final image...")
            result = Image.alpha_composite(image_pil.convert("RGBA"), text_layer).convert("RGB")
            return (torch.from_numpy(np.array(result).astype(np.float32) / 255.0).unsqueeze(0),)
            
        except Exception as e:
            print(f"Error in RS_RusTextOverlay: {str(e)}")
            return (image,)

    def find_optimal_font(self, font_path, text, max_width, max_height, min_size, letter_spacing, line_spacing, outline_thickness, text_orientation):
        temp_img = Image.new("RGB", (max_width, max_height))
        draw = ImageDraw.Draw(temp_img)
        
        if text_orientation == "horizontal":
            lines = text.split('\n')
        else:
            lines = ["".join(text.split('\n'))]
        for size in range(500, min_size - 1, -1):
            try:
                font = ImageFont.truetype(font_path, size)
                fits = True
                total_height = 0
                max_line_width = 0
                for line in lines:
                    line = line.replace('\t', '    ')
                    if text_orientation == "horizontal":
                        text_bbox = draw.textbbox((0, 0), line, font=font)
                        char_count = len(line)
                        line_width = draw.textlength(line, font=font) + letter_spacing * max(0, char_count - 1) + outline_thickness * 2
                        line_height = (text_bbox[3] - text_bbox[1]) * line_spacing + outline_thickness * 2
                    else:
                        char_count = len(line)
                        text_bbox = draw.textbbox((0, 0), line[0] if line else " ", font=font)
                        char_height = text_bbox[3] - text_bbox[1]
                        line_width = draw.textlength(line[0] if line else " ", font=font) + outline_thickness * 2
                        line_height = (char_height + letter_spacing) * char_count + outline_thickness * 2
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
