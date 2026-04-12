import torch
import os
import json
import time
import random
import folder_paths
import numpy as np
from PIL import Image
from server import PromptServer
from aiohttp import web

SELECTION_CACHE = {}
PENDING_DECISIONS = {}

class CancelledException(Exception):
    pass

if hasattr(PromptServer.instance, "routes"):
    @PromptServer.instance.routes.post("/rayko/image_selector")
    async def selection_handler(request):
        try:
            data = await request.json()
            node_id = str(data.get("id"))
            indices = data.get("selection")
            
            if node_id is None or indices is None:
                return web.json_response({"error": "Missing id or selection"}, status=400)

            SELECTION_CACHE[node_id] = indices
            if node_id in PENDING_DECISIONS:
                PENDING_DECISIONS[node_id]["status"] = "completed"
                PENDING_DECISIONS[node_id]["last_heartbeat"] = time.time()
            
            print(f"[ImSELECT 🦊] Selection received for node {node_id}: {len(indices)} images")
            return web.json_response({"status": "received"})
        except Exception as e:
            print(f"[ImSELECT 🦊] Error in selection_handler: {e}")
            return web.json_response({"error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/rayko/imselect/cleanup")
    async def imselect_cleanup(request):
        try:
            data = await request.json()
            node_id = str(data.get("node_id"))
            
            if node_id in PENDING_DECISIONS:
                PENDING_DECISIONS[node_id]["status"] = "removed"
                PENDING_DECISIONS[node_id]["last_heartbeat"] = time.time()
                print(f"[ImSELECT 🦊] Cleanup signal received for node {node_id}")
                return web.json_response({"status": "cleanup recorded"})
            else:
                return web.json_response({"status": "node not found"})
                
        except Exception as e:
            print(f"[ImSELECT 🦊] Cleanup Error: {e}")
            return web.json_response({"error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/rayko/imselect/heartbeat")
    async def imselect_heartbeat(request):
        try:
            data = await request.json()
            node_id = str(data.get("node_id"))
            
            if node_id in PENDING_DECISIONS:
                PENDING_DECISIONS[node_id]["last_heartbeat"] = time.time()
                return web.json_response({"status": "heartbeat received"})
            else:
                return web.json_response({"status": "node not found"}, status=404)
                
        except Exception as e:
            print(f"[ImSELECT 🦊] Heartbeat Error: {e}")
            return web.json_response({"error": str(e)}, status=500)


class RaykoImageSelect:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("selected_images",)
    FUNCTION = "select_batch"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True

    def select_batch(self, images, unique_id):
        unique_id = str(unique_id)
        
        PENDING_DECISIONS[unique_id] = {
            "status": "pending",
            "last_heartbeat": time.time()
        }

        batch_size = images.shape[0]
        temp_dir = folder_paths.get_temp_directory()
        filenames = []

        for i in range(batch_size):
            i_tensor = images[i]
            img_np = 255. * i_tensor.cpu().numpy()
            img = Image.fromarray(np.clip(img_np, 0, 255).astype(np.uint8))
            
            prefix = f"rs_batch_{unique_id}_{i}_{int(time.time())}"
            filename = f"{prefix}.png"
            img.save(os.path.join(temp_dir, filename))
            filenames.append(filename)

        PromptServer.instance.send_sync("rs-image-selector-start", {
            "id": unique_id,
            "images": filenames,
            "count": batch_size
        })

        print(f"[ImSELECT 🦊] Node {unique_id} waiting for user selection...")

        last_send_time = time.time()
        
        while True:
            current_time = time.time()
            
            if unique_id in SELECTION_CACHE:
                print(f"[ImSELECT 🦊] Selection received for node {unique_id}")
                break
            
            state = PENDING_DECISIONS.get(unique_id, {})
            current_status = state.get("status", "pending")
            
            if current_status == "removed":
                print(f"[ImSELECT 🦊] Node {unique_id} REMOVED! Cleaning up...")
                if unique_id in PENDING_DECISIONS:
                    del PENDING_DECISIONS[unique_id]
                break
            
            if current_status == "completed":
                print(f"[ImSELECT 🦊] Node {unique_id} completed via API")
                break
            
            last_heartbeat = state.get("last_heartbeat", time.time())
            if current_time - last_heartbeat > 10:
                print(f"[ImSELECT 🦊] Frontend disconnected for node {unique_id} (heartbeat timeout)")
                if unique_id in PENDING_DECISIONS:
                    del PENDING_DECISIONS[unique_id]
                break
            
            if current_time - last_send_time > 2.0:
                try:
                    PromptServer.instance.send_sync("rs-image-selector-start", {
                        "id": unique_id,
                        "images": filenames,
                        "count": batch_size
                    })
                    last_send_time = current_time
                except Exception as e:
                    print(f"[ImSELECT 🦊] Error sending heartbeat: {e}")
            
            time.sleep(0.3)

        selected_indices = SELECTION_CACHE.pop(unique_id, None)
        if unique_id in PENDING_DECISIONS:
            del PENDING_DECISIONS[unique_id]

        if not selected_indices:
            print(f"[ImSELECT 🦊] Node {unique_id} - no selection, returning all images")
            return (images,)
        
        selected_indices = [int(i) for i in selected_indices if 0 <= int(i) < batch_size]
        
        if not selected_indices:
            print(f"[ImSELECT 🦊] Node {unique_id} - empty selection, returning all images")
            return (images,)

        filtered_images = images[selected_indices]
        print(f"[ImSELECT 🦊] Node {unique_id} - returning {len(filtered_images)} of {batch_size} images")

        return (filtered_images,)

    @classmethod
    def IS_CHANGED(s, images, unique_id):
        return float("nan")


NODE_CLASS_MAPPINGS = {
    "RS Image Selector": RaykoImageSelect,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS Image Selector": "🦊 RS Image Selector",
}