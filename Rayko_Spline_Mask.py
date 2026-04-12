import os
import json
import torch
import numpy as np
from PIL import Image, ImageDraw
import folder_paths
try:
    from server import PromptServer
    from aiohttp import web
except ImportError:
    PromptServer = None
    web = None

class RaykoSplineMask:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "image": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {
                "coordinates": ("STRING", {"multiline": False, "default": "[]"}),
            }
        }
        return inputs

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "create_mask"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True

    def create_mask(self, image, coordinates="[]"):
        img_path = None
        img_tensor = None
        
        if image and isinstance(image, str) and image.strip():
            input_dir = folder_paths.get_input_directory()
            
            if "/" in image:
                parts = image.split("/")
                subfolder = parts[0]
                filename = parts[1]
                full_path = os.path.join(input_dir, subfolder, filename)
            else:
                full_path = os.path.join(input_dir, image)
            
            if os.path.exists(full_path):
                img_path = full_path
                
            if img_path and os.path.exists(img_path):
                try:
                    i = Image.open(img_path)
                    i = i.convert("RGB")
                    img_tensor = torch.from_numpy(np.array(i).astype(np.float32) / 255.0).unsqueeze(0)
                except Exception as e:
                    print(f"[SPLINE 🦊] Error loading image from path {img_path}: {e}")

        if img_tensor is None:
            h, w = 512, 512
            return (torch.zeros((1, h, w, 3)), torch.zeros((1, h, w)))
        
        h, w = img_tensor.shape[1], img_tensor.shape[2]
         
        mask_np = np.zeros((h, w), dtype=np.float32)
        
        try:
            coords = json.loads(coordinates.replace("'", '"'))
            
            if isinstance(coords, list) and len(coords) >= 3:
                pts = [(max(0, min(int(float(p['x'])), w-1)), 
                        max(0, min(int(float(p['y'])), h-1))) for p in coords]
                
                pil_mask = Image.new('L', (w, h), 0)
                draw = ImageDraw.Draw(pil_mask)
                draw.polygon(pts, fill=255)
                mask_np = np.array(pil_mask).astype(np.float32) / 255.0
                 
                print(f"[SPLINE 🦊] Mask created with {len(pts)} points")
            else:
                print(f"[SPLINE 🦊] Less than 3 points - empty mask")
        except Exception as e:
            print(f"[SPLINE 🦊] Error parsing coordinates: {e}")
        
        mask_tensor = torch.from_numpy(mask_np).unsqueeze(0)
        return (img_tensor, mask_tensor)

if PromptServer is not None and web is not None:
    @PromptServer.instance.routes.get("/rayko/spline/images")
    async def spline_get_images(request):
        try:
            input_dir = folder_paths.get_input_directory()
            images = []
            if os.path.exists(input_dir):
                for root, dirs, files in os.walk(input_dir):
                    for file in files:
                        if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp')):
                            rel_path = os.path.relpath(os.path.join(root, file), input_dir)
                            images.append(rel_path.replace('\\', '/'))
            
            return web.json_response({"images": images})
        except Exception as e:
            print(f"[SPLINE 🦊] API Error getting images: {e}")
            return web.json_response({"images": []}, status=200)

NODE_CLASS_MAPPINGS = {"RaykoSplineMask": RaykoSplineMask}
NODE_DISPLAY_NAME_MAPPINGS = {"RaykoSplineMask": "🦊 RS Spline Mask"}