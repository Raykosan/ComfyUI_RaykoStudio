import torch
import torch.nn.functional as F
import comfy.utils
from nodes import MAX_RESOLUTION

class RSUpscaleResize:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                
                "width": ("INT", {"default": 0, "min": 0, "max": MAX_RESOLUTION, "step": 1}),
                "height": ("INT", {"default": 0, "min": 0, "max": MAX_RESOLUTION, "step": 1}),
                
                "upscale_method": (["lanczos", "bicubic", "bilinear", "nearest-exact", "area"], {"default": "lanczos"}),
                "scale_by": ("FLOAT", {"default": 2.0, "min": 0.01, "max": 8.0, "step": 0.01}),
                
                "method": (["stretch", "keep proportion", "fill / crop", "pad"], {"default": "stretch"}),
                "condition": (["always", "downscale if bigger", "upscale if smaller", "if bigger area", "if smaller area"], {"default": "always"}),
                "multiple_of": ([8, 16, 32, 64], {"default": 8}),
            }
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("IMAGE", "width", "height")
    FUNCTION = "execute"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Hybrid upscaler and resizer. Uses 'scale_by' by default. When width/height inputs are connected or set manually (>0), it switches to exact external dimensions."

    def execute(self, image, width, height, upscale_method, scale_by, method, condition, multiple_of):
        _, oh, ow, _ = image.shape
        
        use_external = (width > 0) or (height > 0)
        
        if use_external:
            if width > 0 and height == 0:
                target_w = width
                target_h = round(oh * (width / ow))
            elif height > 0 and width == 0:
                target_h = height
                target_w = round(ow * (height / oh))
            else:
                target_w = width if width > 0 else ow
                target_h = height if height > 0 else oh
        else:
            target_w = round(ow * scale_by)
            target_h = round(oh * scale_by)
            
        target_w = min(target_w, MAX_RESOLUTION)
        target_h = min(target_h, MAX_RESOLUTION)
        
        x = y = x2 = y2 = 0
        pad_left = pad_right = pad_top = pad_bottom = 0
        
        if method == 'keep proportion' or method == 'pad':
            if target_w == 0 and oh < target_h:
                target_w = MAX_RESOLUTION
            elif target_w == 0 and oh >= target_h:
                target_w = ow
                
            if target_h == 0 and ow < target_w:
                target_h = MAX_RESOLUTION
            elif target_h == 0 and ow >= target_w:
                target_h = oh
                
            ratio = min(target_w / ow, target_h / oh)
            new_width = round(ow * ratio)
            new_height = round(oh * ratio)
            
            if method == 'pad':
                pad_left = (target_w - new_width) // 2
                pad_right = target_w - new_width - pad_left
                pad_top = (target_h - new_height) // 2
                pad_bottom = target_h - new_height - pad_top
            
            target_w = new_width
            target_h = new_height
            
        elif method.startswith('fill'):
            target_w = target_w if target_w > 0 else ow
            target_h = target_h if target_h > 0 else oh
            ratio = max(target_w / ow, target_h / oh)
            new_width = round(ow * ratio)
            new_height = round(oh * ratio)
            x = (new_width - target_w) // 2
            y = (new_height - target_h) // 2
            x2 = x + target_w
            y2 = y + target_h
            
            if x2 > new_width:
                x -= (x2 - new_width)
            if x < 0:
                x = 0
            if y2 > new_height:
                y -= (y2 - new_height)
            if y < 0:
                y = 0
                
            target_w = new_width
            target_h = new_height
        else:
            target_w = target_w if target_w > 0 else ow
            target_h = target_h if target_h > 0 else oh

        should_resize = False
        if "always" in condition:
            should_resize = True
        elif "downscale if bigger" == condition and (oh > target_h or ow > target_w):
            should_resize = True
        elif "upscale if smaller" == condition and (oh < target_h or ow < target_w):
            should_resize = True
        elif "bigger area" in condition and (oh * ow > target_h * target_w):
            should_resize = True
        elif "smaller area" in condition and (oh * ow < target_h * target_w):
            should_resize = True

        outputs = image
        if should_resize:
            outputs = image.permute(0, 3, 1, 2)
            
            if upscale_method == "lanczos":
                outputs = comfy.utils.lanczos(outputs, target_w, target_h)
            else:
                outputs = F.interpolate(outputs, size=(target_h, target_w), mode=upscale_method)
            
            if method == 'pad':
                if pad_left > 0 or pad_right > 0 or pad_top > 0 or pad_bottom > 0:
                    outputs = F.pad(outputs, (pad_left, pad_right, pad_top, pad_bottom), value=0)
                    
            outputs = outputs.permute(0, 2, 3, 1)
            
            if method.startswith('fill'):
                if x > 0 or y > 0 or x2 > 0 or y2 > 0:
                    outputs = outputs[:, y:y2, x:x2, :]
        else:
            outputs = image

        final_w = outputs.shape[2]
        final_h = outputs.shape[1]
        
        if multiple_of > 1 and (final_w % multiple_of != 0 or final_h % multiple_of != 0):
            x_crop = (final_w % multiple_of) // 2
            y_crop = (final_h % multiple_of) // 2
            x2_crop = final_w - ((final_w % multiple_of) - x_crop)
            y2_crop = final_h - ((final_h % multiple_of) - y_crop)
            outputs = outputs[:, y_crop:y2_crop, x_crop:x2_crop, :]
            
        outputs = torch.clamp(outputs, 0, 1)
        
        return (outputs, outputs.shape[2], outputs.shape[1])


NODE_CLASS_MAPPINGS = {
    "RSUpscaleResize": RSUpscaleResize
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSUpscaleResize": "🦊 RS Upscale & Resize"
}