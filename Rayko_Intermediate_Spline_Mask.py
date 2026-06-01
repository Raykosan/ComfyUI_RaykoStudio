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

import os
import time
import json
import torch
import numpy as np
from PIL import Image, ImageDraw
import folder_paths

try:
    from server import PromptServer
    from aiohttp import web
    SERVER_AVAILABLE = True
except ImportError:
    SERVER_AVAILABLE = False
    print("\033[91m[InSPLINE ] Warning: Server modules not available.\033[0m")

PENDING_DECISIONS = {}

class RaykoIntermediateSplineMask:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "image": ("IMAGE",),
            },
            "optional": {
                "coordinates": ("STRING", {"multiline": False, "default": "[]"}),
            }
        }
        if SERVER_AVAILABLE:
            inputs["hidden"] = {
                "unique_id": "UNIQUE_ID",
                "prompt_id": "PROMPT_ID",
            }
        return inputs

    # 🔹 ДОБАВЛЕНО: Принудительный запуск ноды при каждом Queue
    # ComfyUI кэширует выводы, если входы не меняются. 
    # Для интерактивных нод с паузой это ломает логику.
    # Возврат time.time() гарантирует, что кэш всегда будет считаться "устаревшим".
    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return time.time()

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "create_mask"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True

    def create_mask(self, image, coordinates="[]", unique_id=None, prompt_id=None):
        unique_id = str(unique_id) if unique_id else "unknown"
        
        if SERVER_AVAILABLE and unique_id:
            if unique_id not in PENDING_DECISIONS:
                PENDING_DECISIONS[unique_id] = {
                    "status": "pending",
                    "coordinates": coordinates
                }
            else:
                PENDING_DECISIONS[unique_id]["coordinates"] = coordinates
            
            if prompt_id is None:
                import uuid
                prompt_id = str(uuid.uuid4())

            try:
                img_tensor = image[0]
                i = 255. * img_tensor.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
                
                filename = f"inspline_{unique_id}_{prompt_id}.png"
                subfolder = "inspline"
                full_output_folder = os.path.join(folder_paths.get_temp_directory(), subfolder)
                os.makedirs(full_output_folder, exist_ok=True)
                img.save(os.path.join(full_output_folder, filename))

                PromptServer.instance.send_sync("rayko.inspline.show", {
                    "node_id": unique_id,
                    "image_url": f"/view?filename={filename}&type=temp&subfolder={subfolder}"
                })
            except Exception as e:
                print(f"[InSPLINE 🦊] Error saving image: {e}")

            while True:
                state = PENDING_DECISIONS.get(unique_id, {})
                current_status = state.get("status", "pending")
                current_coordinates = state.get("coordinates", coordinates)
                
                if current_status == "approved":
                    coordinates = current_coordinates
                    if unique_id in PENDING_DECISIONS:
                        del PENDING_DECISIONS[unique_id]
                    break
                
                if current_status == "cancelled":
                    if unique_id in PENDING_DECISIONS:
                        del PENDING_DECISIONS[unique_id]
                    break

                if current_status == "removed":
                    print(f"[InSPLINE 🦊] Node {unique_id} REMOVED! Cleaning up...")
                    if unique_id in PENDING_DECISIONS:
                        del PENDING_DECISIONS[unique_id]
                    break
                
                if current_status == "rejected":
                    PENDING_DECISIONS[unique_id]["status"] = "pending"
                    coordinates = current_coordinates
                
                time.sleep(0.3)
        else:
            print("[InSPLINE 🦊] Server not available, skipping pause logic.")

        if image is None or len(image) == 0:
            h, w = 512, 512
            return (torch.zeros((1, h, w, 3)), torch.zeros((1, h, w)))
        
        img_tensor = image[0]
        h, w = img_tensor.shape[0], img_tensor.shape[1]
        
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
                
                print(f"[InSPLINE 🦊] Mask created with {len(pts)} points")
            else:
                print(f"[InSPLINE 🦊] Less than 3 points - empty mask")
        except Exception as e:
            print(f"[InSPLINE ] Error parsing coordinates: {e}")
        
        mask_tensor = torch.from_numpy(mask_np).unsqueeze(0)
        return (image, mask_tensor)


if SERVER_AVAILABLE:
    @PromptServer.instance.routes.post("/rayko/inspline/decision")
    async def inspline_decision(request):
        try:
            data = await request.json()
            node_id = str(data.get("node_id"))
            decision = data.get("decision")
            coordinates = data.get("coordinates")
            
            if node_id in PENDING_DECISIONS:
                if decision == "approve":
                    PENDING_DECISIONS[node_id]["status"] = "approved"
                    if coordinates:
                        PENDING_DECISIONS[node_id]["coordinates"] = coordinates
                    
                elif decision == "reject":
                    PENDING_DECISIONS[node_id]["status"] = "rejected"
                    if coordinates is not None:
                        PENDING_DECISIONS[node_id]["coordinates"] = coordinates
                    
                elif decision == "cancel":
                    PENDING_DECISIONS[node_id]["status"] = "cancelled"
                    
                return web.Response(status=200, text="Decision recorded")
            else:
                return web.Response(status=404, text=f"Node {node_id} not waiting")
                
        except Exception as e:
            print(f"[InSPLINE 🦊] API Error: {e}")
            import traceback
            traceback.print_exc()
            return web.Response(status=500, text=str(e))

    @PromptServer.instance.routes.post("/rayko/inspline/cleanup")
    async def inspline_cleanup(request):
        try:
            data = await request.json()
            node_id = str(data.get("node_id"))
            
            if node_id in PENDING_DECISIONS:
                PENDING_DECISIONS[node_id]["status"] = "removed"
                return web.Response(status=200, text="Cleanup recorded")
            else:
                return web.Response(status=200, text="Node not found")
                
        except Exception as e:
            print(f"[InSPLINE 🦊] Cleanup Error: {e}")
            return web.Response(status=500, text=str(e))

NODE_CLASS_MAPPINGS = {"RaykoIntermediateSplineMask": RaykoIntermediateSplineMask}
NODE_DISPLAY_NAME_MAPPINGS = {"RaykoIntermediateSplineMask": "🦊 RS Intermediate Spline Mask"}