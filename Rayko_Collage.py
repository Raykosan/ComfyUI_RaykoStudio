# SPDX-License-Identifier: Apache-2.0
# Copyright 2025-2026 Raykosan (RaykoStudio)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import torch
import numpy as np
import os
import time
from PIL import Image, ImageOps, ImageFilter
from server import PromptServer
from aiohttp import web
import folder_paths

TRANSFORM_CACHE = {}
PENDING_TRANSFORMS = {}

@PromptServer.instance.routes.post("/rayko/rs_collage")
async def transform_handler(request):
    try:
        data = await request.json()
        node_id = str(data.get("id"))
        transforms = data.get("transforms")
        
        if node_id is None or transforms is None:
            return web.json_response({"error": "Missing data"}, status=400)

        TRANSFORM_CACHE[node_id] = {
            **transforms,
            "opacity": data.get("opacity", 1.0),
            "feather_type": data.get("feather_type", "None"),
            "edge_radius": data.get("edge_radius", 300),
            "shape_radius": data.get("shape_radius", 0),
            "feather_center_x": data.get("feather_center_x", 0.5),
            "feather_center_y": data.get("feather_center_y", 0.5)
        }

        if node_id in PENDING_TRANSFORMS:
            PENDING_TRANSFORMS[node_id]["status"] = "completed"
            
        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_collage/cancel")
async def cancel_handler(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        if node_id not in PENDING_TRANSFORMS:
            PENDING_TRANSFORMS[node_id] = {}
        PENDING_TRANSFORMS[node_id]["status"] = "cancelled"
        return web.json_response({"status": "cancelled"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_collage/cleanup")
async def cleanup_handler(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        TRANSFORM_CACHE.pop(node_id, None)
        PENDING_TRANSFORMS.pop(node_id, None)
        temp_dir = folder_paths.get_temp_directory()
        for f in os.listdir(temp_dir):
            if f.startswith(f"rs_collage_{node_id}_"):
                try: os.remove(os.path.join(temp_dir, f))
                except: pass
        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

class RSCollage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "overlay_image": ("IMAGE",),
                "background_image": ("IMAGE",),
                "opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "feather_type": (["None", "Radial In", "Radial Out", "Edge", "Shape"], {"default": "None"}),
                "edge_radius": ("INT", {"default": 300, "min": 0, "max": 300, "step": 1}), 
                "shape_radius": ("INT", {"default": 0, "min": 0, "max": 5, "step": 1}),
            },
            "optional": {"overlay_mask": ("MASK",)},
            "hidden": {"unique_id": "UNIQUE_ID"}
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "composite"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True

    def remove_black_corners(self, img):
        if img.mode != 'RGBA': return img
        arr = np.array(img)
        black = (arr[:,:,0]==0) & (arr[:,:,1]==0) & (arr[:,:,2]==0)
        arr[black, 3] = 0
        return Image.fromarray(arr, 'RGBA')

    def apply_radial_feather(self, img, edge_radius, cx, cy, invert=False):
        if img.mode != 'RGBA': img = img.convert('RGBA')
        arr = np.array(img).astype(np.float32)
        h, w = arr.shape[:2]
        cx_px, cy_px = w * cx, h * cy
        y, x = np.ogrid[:h, :w]
        dist = np.hypot(x - cx_px, y - cy_px)
        max_dist = max(np.hypot(cx_px, cy_px), np.hypot(w-cx_px, cy_px), np.hypot(cx_px, h-cy_px), np.hypot(w-cx_px, h-cy_px)) or 1
        feather_width = max((edge_radius / 300.0) * max_dist, 1.0)
        mask = 1.0 - np.clip(dist / feather_width, 0.0, 1.0)
        if invert: mask = 1.0 - mask
        arr[:,:,3] *= mask
        return Image.fromarray(arr.astype(np.uint8), 'RGBA')

    def apply_edge_feather(self, img, edge_radius):
        if img.mode != 'RGBA': img = img.convert('RGBA')
        arr = np.array(img).astype(np.float32)
        h, w = arr.shape[:2]
        y, x = np.ogrid[:h, :w]
        dist = np.minimum(np.minimum(x, w-1-x), np.minimum(y, h-1-y))
        max_dist = min(w, h) / 2.0 or 1
        feather_width = max((edge_radius / 300.0) * max_dist, 1.0)
        mask = np.clip(dist / feather_width, 0.0, 1.0)
        arr[:,:,3] *= mask
        return Image.fromarray(arr.astype(np.uint8), 'RGBA')

    def apply_shape_feather(self, img, shape_radius):
        if shape_radius <= 0: return img
        if img.mode != 'RGBA': img = img.convert('RGBA')
        r, g, b, a = img.split()
        a = a.filter(ImageFilter.GaussianBlur(radius=shape_radius))
        return Image.merge('RGBA', (r, g, b, a))

    def tensor2pil(self, tensor):
        if len(tensor.shape) == 4:
            if tensor.shape[0] > 1: tensor = tensor[0]
        arr = (tensor.cpu().numpy() * 255).astype(np.uint8)
        while arr.ndim > 3: arr = arr[0]
        if arr.ndim < 3: arr = np.expand_dims(arr, axis=-1)
        c = arr.shape[2]
        if c >= 4: return Image.fromarray(arr[:,:,:4], 'RGBA')
        if c == 3: return Image.fromarray(arr, 'RGB')
        return Image.fromarray(arr[:,:,0], 'L')

    def mask2pil(self, mask):
        if len(mask.shape) == 3:
            if mask.shape[0] > 1: mask = mask[0]
        elif len(mask.shape) == 4: mask = mask[0, :, :, 0]
        arr = (mask.cpu().numpy() * 255).astype(np.uint8)
        return Image.fromarray(arr, 'L')

    def pil2tensor(self, pil):
        if pil.mode == 'L': pil = pil.convert('RGB')
        elif pil.mode != 'RGB': pass
        return torch.from_numpy(np.array(pil).astype(np.float32) / 255.0).unsqueeze(0)

    def composite(self, overlay_image, background_image, opacity=1.0, feather_type="None", edge_radius=0, shape_radius=0, overlay_mask=None, unique_id=None):
        unique_id = str(unique_id) if unique_id is not None else "unknown"

        if overlay_image.numel() == 0 or background_image.numel() == 0:
            return (background_image,)

        h, w = overlay_image.shape[1], overlay_image.shape[2]
        if h < 8 or w < 8:
            return (background_image,)

        TRANSFORM_CACHE.pop(unique_id, None)

        bg_pil = self.tensor2pil(background_image)
        ov_pil = self.tensor2pil(overlay_image)
        bg_w, bg_h = bg_pil.size

        if overlay_mask is not None:
            mp = self.mask2pil(overlay_mask)
            if mp.size != ov_pil.size: mp = mp.resize(ov_pil.size, Image.Resampling.LANCZOS)
            r,g,b,a = ov_pil.split()
            ov_pil = Image.merge('RGBA', (r,g,b, ImageOps.invert(mp)))
        else:
            if ov_pil.mode != 'RGBA': ov_pil = ov_pil.convert('RGBA')

        def apply_transforms(data):
            rx = bg_w/2 if data.get("x") is None else float(data.get("x"))
            ry = bg_h/2 if data.get("y") is None else float(data.get("y"))
            
            sc_x = float(data.get("scale_x") or 1.0)
            sc_y = float(data.get("scale_y") or 1.0)
            
            rot = float(data.get("rotation") or 0)
            fh = bool(data.get("flip_h"))
            fv = bool(data.get("flip_v"))
            op = float(data.get("opacity") or opacity)
            ft = data.get("feather_type") or feather_type
            er = int(data.get("edge_radius") or edge_radius)
            sr = int(data.get("shape_radius") or shape_radius)
            fcx = float(data.get("feather_center_x") or 0.5)
            fcy = float(data.get("feather_center_y") or 0.5)

            rc = rot if (fh != fv) else -rot
            ov = ov_pil

            if sc_x != 1.0 or sc_y != 1.0:
                new_w = max(1, int(ov.width * sc_x))
                new_h = max(1, int(ov.height * sc_y))
                ov = ov.resize((new_w, new_h), Image.Resampling.LANCZOS)
                
            if rc != 0: 
                ov = ov.rotate(rc, expand=True, resample=Image.Resampling.BICUBIC, center=(ov.width//2, ov.height//2))
                ov = self.remove_black_corners(ov)
            if fh: ov = ImageOps.mirror(ov)
            if fv: ov = ImageOps.flip(ov)

            if ft == "Radial Out" and er > 0: ov = self.apply_radial_feather(ov, er, fcx, fcy, invert=False)
            elif ft == "Radial In" and er > 0: ov = self.apply_radial_feather(ov, er, fcx, fcy, invert=True)
            elif ft == "Edge" and er > 0: ov = self.apply_edge_feather(ov, er)
            elif ft == "Shape" and sr > 0: ov = self.apply_shape_feather(ov, sr)

            if op < 1.0:
                r,g,b,a = ov.split()
                ov = Image.merge('RGBA', (r,g,b, a.point(lambda x: int(x*op))))

            res = bg_pil.copy()
            res.paste(ov, (int(rx-ov.width//2), int(ry-ov.height//2)), ov if ov.mode=='RGBA' else None)
            return self.pil2tensor(res)

        ts = int(time.time()*1000)
        td = folder_paths.get_temp_directory()
        for f in os.listdir(td):
            if f.startswith(f"rs_collage_{unique_id}_"):
                try: os.remove(os.path.join(td, f))
                except: pass

        bfn = f"rs_collage_{unique_id}_{ts}_bg.png"
        ofn = f"rs_collage_{unique_id}_{ts}_ov.png"
        bg_pil.save(os.path.join(td, bfn))
        ov_pil.save(os.path.join(td, ofn))

        PENDING_TRANSFORMS[unique_id] = {"status": "pending"}
        
        PromptServer.instance.send_sync("rs-collage-start", {
            "id": unique_id, "bg_file": bfn, "ov_file": ofn, "bg_width": bg_w, "bg_height": bg_h,
            "ov_width": ov_pil.width, "ov_height": ov_pil.height, "timestamp": ts,
            "opacity": opacity, "feather_type": feather_type, "edge_radius": edge_radius, "shape_radius": shape_radius
        })

        print(f"[RS Collage] Node {unique_id} waiting for user input (Apply/Cancel)...")
        
        while unique_id not in TRANSFORM_CACHE:
            time.sleep(0.2)
            
            if unique_id in PENDING_TRANSFORMS:
                if PENDING_TRANSFORMS[unique_id].get("status") == "cancelled":
                    print(f"[RS Collage] Cancelled by user for node {unique_id}")
                    PENDING_TRANSFORMS.pop(unique_id, None)
                    return (self.pil2tensor(bg_pil),)

        print(f"[RS Collage] Input received for node {unique_id}")
        PENDING_TRANSFORMS.pop(unique_id, None)
        result = apply_transforms(TRANSFORM_CACHE.pop(unique_id))
        
        for f in [bfn, ofn]:
            try: os.remove(os.path.join(td, f))
            except: pass
        
        return (result,)

    @classmethod
    def IS_CHANGED(cls, **kwargs): return time.time()

NODE_CLASS_MAPPINGS = {"RSCollage": RSCollage}
NODE_DISPLAY_NAME_MAPPINGS = {"RSCollage": "🦊 RS Collage"}