import base64
import io
import numpy as np
import server
import torch
import torch.nn.functional as F
from aiohttp import web
from PIL import Image
import time
import os
import folder_paths
import threading
import gc

_GRID = 16
_MIN_DIM = 32
_DEFAULT_PAD_FACTOR = 0.3

_frame_cache = {}
_PENDING_DECISIONS = {}

def _tensor_hash(tensor):
    try:
        t = tensor[0] if tensor.dim() == 4 else tensor
        arr = (t.cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
        return hash(arr.tobytes())
    except Exception:
        return None

def _tensor_to_jpeg(image_tensor):
    arr = (image_tensor.cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()

class RSOutpaint:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Source image."}),
                "crop_state": ("STRING", {"default": "", "tooltip": "Internal state", "hidden": True}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "MASK", "IMAGE", "INT", "INT")
    RETURN_NAMES = ("control_image", "control_mask", "mask_image", "width", "height")
    FUNCTION = "outpaint_prep"
    OUTPUT_NODE = True
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Interactive mask for outpaint with auto-reset"

    @classmethod
    def IS_CHANGED(cls, image, unique_id):
        return float("nan")

    def outpaint_prep(self, image, crop_state, unique_id):
        src = image[0] if image.dim() == 4 else image
        src_h, src_w, _ = src.shape
        
        if src_w < _MIN_DIM or src_h < _MIN_DIM:
            raise ValueError(f"[RS Outpaint] Input image too small ({src_w}×{src_h}).")

        unique_id = str(unique_id)
        
        try:
            src_hash = _tensor_hash(src)
            cached = _frame_cache.get(unique_id, {})
            is_new_image = (cached.get("src_hash") != src_hash or 
                            cached.get("width") != src_w or 
                            cached.get("height") != src_h)

            if is_new_image:
                if unique_id in _frame_cache: del _frame_cache[unique_id]
                if unique_id in _PENDING_DECISIONS: del _PENDING_DECISIONS[unique_id]
                crop_state = "" 
                print(f"🦊 [RS Outpaint] New image detected for node {unique_id}. State reset.")

            if unique_id not in _PENDING_DECISIONS:
                _PENDING_DECISIONS[unique_id] = {
                    "status": "pending",
                    "crop_state": crop_state,
                    "last_heartbeat": time.time()
                }
                _frame_cache[unique_id] = {"width": src_w, "height": src_h, "src_hash": src_hash, "image": _tensor_to_jpeg(src)}
                print(f"🦊 [RS Outpaint] Waiting for approval for node {unique_id} (size: {src_w}×{src_h})")
                
                try:
                    i = 255. * src.cpu().numpy()
                    img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
                    filename = f"rsoutpaint_{unique_id}.png"
                    subfolder = "rsoutpaint"
                    full_output_folder = os.path.join(folder_paths.get_temp_directory(), subfolder)
                    os.makedirs(full_output_folder, exist_ok=True)
                    img.save(os.path.join(full_output_folder, filename))

                    server.PromptServer.instance.send_sync("rs_outpaint.show", {
                        "node_id": unique_id,
                        "image_url": f"/view?filename={filename}&type=temp&subfolder={subfolder}",
                        "image_width": img.width,
                        "image_height": img.height
                    })
                except Exception as e:
                    print(f"🦊 [RS Outpaint] Error saving preview: {e}")

            # Цикл ожидания
            while True:
                state = _PENDING_DECISIONS.get(unique_id, {})
                current_status = state.get("status", "pending")
                current_crop_state = state.get("crop_state", crop_state)
                last_hb = state.get("last_heartbeat", time.time())
                
                if current_status == "approved":
                    crop_state = current_crop_state
                    print(f"🦊 [RS Outpaint] Approved! Continuing for node {unique_id}")
                    break
                    
                elif current_status == "cancelled":
                    print(f"🦊 [RS Outpaint] Cancelled for node {unique_id}")
                    return (torch.zeros((1, src_h, src_w, 3)), torch.ones((1, src_h, src_w)), torch.zeros((1, src_h, src_w, 3)), 0, 0)
                    
                elif current_status == "removed":
                    return (image, torch.ones((1, src_h, src_w)), image, src_w, src_h)
                    
                elif time.time() - last_hb > 10.0:
                    print(f"🦊 [RS Outpaint] Heartbeat timeout for node {unique_id}, forcing cleanup...")
                    return (image, torch.ones((1, src_h, src_w)), image, src_w, src_h)
                    
                elif current_status == "rejected":
                    _PENDING_DECISIONS[unique_id]["status"] = "pending"
                    crop_state = current_crop_state
                    
                time.sleep(0.2)

            # Парсинг и генерация маски
            crop_x = crop_y = crop_w = crop_h = 0
            output_width = output_height = 0
            use_crop_state = False
            color_r, color_g, color_b = 255, 0, 0
            bg_r, bg_g, bg_b = 20, 20, 20
            
            if crop_state:
                try:
                    parts = [int(v) for v in str(crop_state).split(",")]
                    if len(parts) >= 4:
                        cx, cy, cw, ch = parts[:4]
                        if cw > 0 and ch > 0:
                            crop_x, crop_y, crop_w, crop_h = cx, cy, cw, ch
                            use_crop_state = True
                    if len(parts) >= 6:
                        output_width, output_height = parts[4], parts[5]
                    if len(parts) >= 9:
                        color_r, color_g, color_b = parts[6], parts[7], parts[8]
                        if len(parts) >= 12:
                             bg_r, bg_g, bg_b = parts[9], parts[10], parts[11]
                except ValueError:
                    pass

            if not use_crop_state:
                pad = max(_GRID, round(src_h * _DEFAULT_PAD_FACTOR / _GRID) * _GRID)
                crop_x = 0
                crop_y = -pad
                crop_w = round(src_w / _GRID) * _GRID
                crop_h = round((src_h + pad) / _GRID) * _GRID

            eff_w = output_width if output_width >= _GRID else crop_w
            eff_h = output_height if output_height >= _GRID else crop_h
            eff_w = max(eff_w, _GRID)
            eff_h = max(eff_h, _GRID)

            src_np = src.cpu().numpy()
            out = np.full((eff_h, eff_w, 3), 0.5, dtype=np.float32)
            mask = np.ones((eff_h, eff_w), dtype=np.float32)

            src_x_start = max(0, crop_x)
            src_y_start = max(0, crop_y)
            src_x_end = min(src_w, crop_x + crop_w)
            src_y_end = min(src_h, crop_y + crop_h)
            src_copy_w = max(0, src_x_end - src_x_start)
            src_copy_h = max(0, src_y_end - src_y_start)

            if src_copy_w > 0 and src_copy_h > 0:
                crop_offset_x = (eff_w - crop_w) // 2
                crop_offset_y = (eff_h - crop_h) // 2
                img_offset_in_crop_x = max(0, -crop_x)
                img_offset_in_crop_y = max(0, -crop_y)
                final_dst_x = crop_offset_x + img_offset_in_crop_x
                final_dst_y = crop_offset_y + img_offset_in_crop_y
                final_dst_x = max(0, min(final_dst_x, eff_w - 1))
                final_dst_y = max(0, min(final_dst_y, eff_h - 1))
                copy_w = max(0, min(src_copy_w, eff_w - final_dst_x))
                copy_h = max(0, min(src_copy_h, eff_h - final_dst_y))
                
                if copy_w > 0 and copy_h > 0:
                    src_slice = src_np[src_y_start:src_y_start + copy_h, src_x_start:src_x_start + copy_w]
                    dst_slice = out[final_dst_y:final_dst_y + copy_h, final_dst_x:final_dst_x + copy_w]
                    if src_slice.shape == dst_slice.shape:
                        dst_slice[:] = src_slice
                        mask[final_dst_y:final_dst_y + copy_h, final_dst_x:final_dst_x + copy_w] = 0.0
                    else:
                        min_h = min(src_slice.shape[0], dst_slice.shape[0])
                        min_w = min(src_slice.shape[1], dst_slice.shape[1])
                        if min_h > 0 and min_w > 0:
                            dst_slice[:min_h, :min_w] = src_slice[:min_h, :min_w]
                            mask[final_dst_y:final_dst_y + min_h, final_dst_x:final_dst_x + min_w] = 0.0

            control_image = torch.from_numpy(out).unsqueeze(0)
            control_mask = torch.from_numpy(mask).unsqueeze(0)
            norm_color = torch.tensor([color_r/255.0, color_g/255.0, color_b/255.0]).view(1, 1, 1, 3)
            norm_bg = torch.tensor([bg_r/255.0, bg_g/255.0, bg_b/255.0]).view(1, 1, 1, 3)
            mask_exp = control_mask.unsqueeze(3)
            mask_image = mask_exp * norm_color + (1.0 - mask_exp) * norm_bg
            mask_image = torch.clamp(mask_image, 0.0, 1.0)

            return (control_image, control_mask, mask_image, eff_w, eff_h)

        finally:
            # Всегда очищаем состояние, чтобы следующие запуски не зависали
            if unique_id in _PENDING_DECISIONS:
                del _PENDING_DECISIONS[unique_id]

NODE_CLASS_MAPPINGS = {"RSOutpaint": RSOutpaint}
NODE_DISPLAY_NAME_MAPPINGS = {"RSOutpaint": "🦊 RS Outpaint"}

@server.PromptServer.instance.routes.post("/rs_outpaint/decision")
async def rs_outpaint_decision(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        decision = data.get("decision")
        crop_state = data.get("crop_state")
        if node_id in _PENDING_DECISIONS:
            if decision == "approve":
                _PENDING_DECISIONS[node_id]["status"] = "approved"
                if crop_state: _PENDING_DECISIONS[node_id]["crop_state"] = crop_state
            elif decision == "cancel":
                _PENDING_DECISIONS[node_id]["status"] = "cancelled"
            return web.Response(status=200, text="OK")
        return web.Response(status=404, text="Not waiting")
    except Exception as e:
        return web.Response(status=500, text=str(e))

@server.PromptServer.instance.routes.post("/rs_outpaint/cleanup")
async def rs_outpaint_cleanup(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        if node_id in _PENDING_DECISIONS:
            _PENDING_DECISIONS[node_id]["status"] = "removed"
            _PENDING_DECISIONS[node_id]["last_heartbeat"] = time.time()
        return web.Response(status=200, text="OK")
    except Exception as e:
        return web.Response(status=500, text=str(e))

@server.PromptServer.instance.routes.post("/rs_outpaint/heartbeat")
async def rs_outpaint_heartbeat(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        if node_id in _PENDING_DECISIONS:
            _PENDING_DECISIONS[node_id]["last_heartbeat"] = time.time()
            return web.Response(status=200, text="OK")
        return web.Response(status=404, text="Not found")
    except Exception as e:
        return web.Response(status=500, text=str(e))

print("🦊 [RS Outpaint] ✅ Routes registered")