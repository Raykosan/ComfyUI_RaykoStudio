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
from PIL import Image
import folder_paths

try:
    from server import PromptServer
    from aiohttp import web
    SERVER_AVAILABLE = True
except ImportError:
    SERVER_AVAILABLE = False

PENDING_DECISIONS = {}

class RSCropImage:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "image": ("IMAGE",),
                "multiple_mode": ("BOOLEAN", {
                    "default": False,
                    "label_on": "ON",
                    "label_off": "OFF",
                }),
                "multiple_of": (["4", "8", "16", "32", "64"], {
                    "default": "8",
                }),
            },
            "optional": {
                "mask": ("MASK",),
                "crop_data": ("STRING", {"multiline": False, "default": "{}"}),
            }
        }
        if SERVER_AVAILABLE:
            inputs["hidden"] = {
                "unique_id": "UNIQUE_ID",
                "prompt_id": "PROMPT_ID",
            }
        return inputs

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("CROPPED_IMAGE", "CROP_DATA")
    FUNCTION = "crop_image"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True

    def crop_image(self, image, multiple_mode=False, multiple_of="8",
                   mask=None, crop_data="{}", unique_id=None, prompt_id=None):
        unique_id = str(unique_id) if unique_id else "unknown"
        
        crop_dict = {}
        try:
            crop_dict = json.loads(crop_data.replace("'", '"'))
        except Exception:
            crop_dict = {}
        
        # Логика вычисления координат по маске
        if mask is not None and len(mask) > 0:
            try:
                m = mask[0]
                coords = torch.nonzero(m > 0.5)
                if coords.numel() > 0:
                    min_y, min_x = coords.min(dim=0)[0].tolist()
                    max_y, max_x = coords.max(dim=0)[0].tolist()
                    
                    crop_dict["x"] = int(min_x)
                    crop_dict["y"] = int(min_y)
                    crop_dict["width"] = int(max_x - min_x + 1)
                    crop_dict["height"] = int(max_y - min_y + 1)
            except Exception as e:
                print(f"[RS Crop 🦊] Error processing mask: {e}")

        updated_crop_data = json.dumps(crop_dict)
        
        if SERVER_AVAILABLE and unique_id:
            if unique_id not in PENDING_DECISIONS:
                PENDING_DECISIONS[unique_id] = {
                    "status": "pending",
                    "crop_data": updated_crop_data
                }
            
            if prompt_id is None:
                import uuid
                prompt_id = str(uuid.uuid4())

            try:
                img_tensor = image[0]
                i = 255. * img_tensor.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
                
                filename = f"rscrop_{unique_id}_{prompt_id}.png"
                subfolder = "rscrop"
                full_output_folder = os.path.join(folder_paths.get_temp_directory(), subfolder)
                os.makedirs(full_output_folder, exist_ok=True)
                img.save(os.path.join(full_output_folder, filename))

                PromptServer.instance.send_sync("rayko.rscrop.show", {
                    "node_id": unique_id,
                    "image_url": f"/view?filename={filename}&type=temp&subfolder={subfolder}",
                    "image_width": img.width,
                    "image_height": img.height,
                    "crop_data": updated_crop_data
                })
            except Exception as e:
                print(f"[RS Crop 🦊] Error saving image: {e}")

            while True:
                state = PENDING_DECISIONS.get(unique_id, {})
                current_status = state.get("status", "pending")
                current_crop_data = state.get("crop_data", updated_crop_data)
                
                if current_status == "approved":
                    crop_data = current_crop_data
                    if unique_id in PENDING_DECISIONS:
                        del PENDING_DECISIONS[unique_id]
                    break
                
                if current_status == "cancelled":
                    if unique_id in PENDING_DECISIONS:
                        del PENDING_DECISIONS[unique_id]
                    return (image, "{}")
                    
                if current_status == "removed":
                    if unique_id in PENDING_DECISIONS:
                        del PENDING_DECISIONS[unique_id]
                    return (image, "{}")
                
                if current_status == "rejected":
                    PENDING_DECISIONS[unique_id]["status"] = "pending"
                
                time.sleep(0.3)

        try:
            final_crop_dict = json.loads(crop_data.replace("'", '"'))
        except Exception:
            final_crop_dict = {}
        
        x = round(final_crop_dict.get("x", 0))
        y = round(final_crop_dict.get("y", 0))
        width = round(final_crop_dict.get("width", 512))
        height = round(final_crop_dict.get("height", 512))
        
        if image is None or len(image) == 0:
            h, w = 512, 512
            crop_output = {
                "source_width": w,
                "source_height": h,
                "x": 0,
                "y": 0,
                "width": 512,
                "height": 512
            }
            return (torch.zeros((1, h, w, 3)), json.dumps(crop_output))
        
        img_tensor = image[0]
        img_height = img_tensor.shape[0]
        img_width = img_tensor.shape[1]
        
        x = max(0, min(x, img_width - 1))
        y = max(0, min(y, img_height - 1))
        x2 = min(x + width, img_width)
        y2 = min(y + height, img_height)
        
        actual_width = max(1, x2 - x)
        actual_height = max(1, y2 - y)
        
        if len(img_tensor.shape) == 3:
            cropped = img_tensor[y:y2, x:x2, :].unsqueeze(0)
        else:
            cropped = img_tensor[:, y:y2, x:x2, :]
        
        crop_output = {
            "source_width": img_width,
            "source_height": img_height,
            "x": x,
            "y": y,
            "width": actual_width,
            "height": actual_height
        }
        
        return (cropped, json.dumps(crop_output))


if SERVER_AVAILABLE:
    @PromptServer.instance.routes.post("/rayko/rscrop/decision")
    async def rscrop_decision(request):
        try:
            data = await request.json()
            node_id = str(data.get("node_id"))
            decision = data.get("decision")
            crop_data = data.get("crop_data")
            
            if node_id in PENDING_DECISIONS:
                if decision == "approve":
                    PENDING_DECISIONS[node_id]["status"] = "approved"
                    if crop_data:
                        PENDING_DECISIONS[node_id]["crop_data"] = crop_data
                elif decision == "reject":
                    PENDING_DECISIONS[node_id]["status"] = "rejected"
                    if crop_data is not None:
                        PENDING_DECISIONS[node_id]["crop_data"] = crop_data
                elif decision == "cancel":
                    PENDING_DECISIONS[node_id]["status"] = "cancelled"
                return web.Response(status=200, text="Decision recorded")
            else:
                return web.Response(status=404, text=f"Node {node_id} not waiting")
        except Exception as e:
            return web.Response(status=500, text=str(e))

    @PromptServer.instance.routes.post("/rayko/rscrop/cleanup")
    async def rscrop_cleanup(request):
        try:
            data = await request.json()
            node_id = str(data.get("node_id"))
            if node_id in PENDING_DECISIONS:
                PENDING_DECISIONS[node_id]["status"] = "removed"
                return web.Response(status=200, text="Cleanup recorded")
            else:
                return web.Response(status=200, text="Node not found")
        except Exception as e:
            return web.Response(status=500, text=str(e))


NODE_CLASS_MAPPINGS = {"RSCropImage": RSCropImage}
NODE_DISPLAY_NAME_MAPPINGS = {"RSCropImage": "🦊 RS Crop Image"}