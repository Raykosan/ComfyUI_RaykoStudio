import os
import torch
import numpy as np
import json
from PIL import Image, ImageDraw
import folder_paths

print("🦊 RS Spline Mask LOADED")

class RaykoSplineMask:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) 
                 if os.path.isfile(os.path.join(input_dir, f)) 
                 and f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]
        
        if not files:
            files = ["no_images_found"]
        
        return {
            "required": {
                "image": (sorted(files), {"image_upload": True}),
            },
            "optional": {
                "coordinates": ("STRING", {"multiline": False, "default": "[]"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "create_mask"
    CATEGORY = "🦊 RaykoStudio"

    def create_mask(self, image, coordinates="[]"):
        print(f"[SPLINE] Received coordinates: {coordinates}")
        print(f"[SPLINE] Type: {type(coordinates)}")
        
        if not image or image == "no_images_found":
            h, w = 512, 512
            return (torch.zeros((1, h, w, 3)), torch.zeros((1, h, w)))
        
        image_path = folder_paths.get_annotated_filepath(image)
        img = Image.open(image_path).convert("RGB")
        w, h = img.size
        
        img_np = np.array(img).astype(np.float32) / 255.0
        img_tensor = torch.from_numpy(img_np).unsqueeze(0)
        
        mask_np = np.zeros((h, w), dtype=np.float32)
        
        try:
            coords = json.loads(coordinates.replace("'", '"'))
            print(f"[SPLINE] Parsed {len(coords)} points")
            
            if isinstance(coords, list) and len(coords) >= 3:
                pts = [(max(0, min(int(float(p['x'])), w-1)), 
                        max(0, min(int(float(p['y'])), h-1))) for p in coords]
                
                pil_mask = Image.new('L', (w, h), 0)
                draw = ImageDraw.Draw(pil_mask)
                draw.polygon(pts, fill=255)
                mask_np = np.array(pil_mask).astype(np.float32) / 255.0
                
                print(f"[SPLINE] ✅ Mask created with {len(pts)} points")
            else:
                print(f"[SPLINE] ⚠️ Less than 3 points")
        except Exception as e:
            print(f"[SPLINE] ❌ Error: {e}")
            import traceback
            traceback.print_exc()
        
        mask_tensor = torch.from_numpy(mask_np).unsqueeze(0)
        
        return (img_tensor, mask_tensor)

NODE_CLASS_MAPPINGS = {"RaykoSplineMask": RaykoSplineMask}
NODE_DISPLAY_NAME_MAPPINGS = {"RaykoSplineMask": "🦊 RS Spline Mask"}