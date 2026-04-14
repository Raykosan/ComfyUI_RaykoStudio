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

print("\033[93m🦊\033[0m \033[93mRaykoStudio - RS Outpaint  \033[92mLOADED\033[0m")

_GRID = 16
_MIN_DIM = 32
_DEFAULT_PAD_FACTOR = 0.3

_frame_cache = {}
_PENDING_DECISIONS = {}

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
                "crop_state": ("STRING", {
                    "default": "",
                    "tooltip": "Canvas-managed crop state: 'x,y,w,h[,ow,oh]' in source pixels. Set by the interactive widget.",
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "INT", "INT")
    RETURN_NAMES = ("control_image", "control_mask", "width", "height")
    FUNCTION = "outpaint_prep"
    OUTPUT_NODE = True
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Interactive mask for outpaint with pause"

    def outpaint_prep(self, image, crop_state, unique_id):
        if image.dim() == 4:
            src = image[0]
        else:
            src = image

        src_h, src_w, _ = src.shape

        if src_w < _MIN_DIM or src_h < _MIN_DIM:
            raise ValueError(f"[RS Outpaint] Input image dimensions ({src_w}×{src_h}) are too small to be valid.")

        unique_id = str(unique_id)
        
        # ✅ ПАУЗА: Если нода еще не ждет решения, запускаем процесс паузы
        if unique_id not in _PENDING_DECISIONS:
            _PENDING_DECISIONS[unique_id] = {
                "status": "pending",
                "crop_state": crop_state
            }
            
            # Сохраняем изображение для превью
            _frame_cache[unique_id] = {
                "width": src_w,
                "height": src_h,
                "image": _tensor_to_jpeg(src),
            }
            print(f"🦊 [RS Outpaint] Waiting for approval for node {unique_id}")
            
            # Отправляем событие для показа интерфейса с размерами
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

        # Ждем решения пользователя
        while True:
            state = _PENDING_DECISIONS.get(unique_id, {})
            current_status = state.get("status", "pending")
            current_crop_state = state.get("crop_state", crop_state)
            
            if current_status == "approved":
                crop_state = current_crop_state
                if unique_id in _PENDING_DECISIONS:
                    del _PENDING_DECISIONS[unique_id]
                print(f"🦊 [RS Outpaint] Approved! Continuing generation for node {unique_id}")
                break
            
            if current_status == "cancelled":
                if unique_id in _PENDING_DECISIONS:
                    del _PENDING_DECISIONS[unique_id]
                print(f"🦊 [RS Outpaint] Cancelled for node {unique_id}")
                empty_img = torch.zeros((1, src_h, src_w, 3))
                empty_mask = torch.ones((1, src_h, src_w))
                return (empty_img, empty_mask, 0, 0)
                
            if current_status == "removed":
                if unique_id in _PENDING_DECISIONS:
                    del _PENDING_DECISIONS[unique_id]
                return (image, torch.ones((1, src_h, src_w)), src_w, src_h)
            
            if current_status == "rejected":
                _PENDING_DECISIONS[unique_id]["status"] = "pending"
                crop_state = current_crop_state
            
            time.sleep(0.3)

        # ✅ Парсинг crop_state после получения решения
        crop_x = crop_y = crop_w = crop_h = 0
        output_width = output_height = 0
        
        if crop_state:
            try:
                parts = [int(v) for v in str(crop_state).split(",")]
                if len(parts) >= 4:
                    crop_x, crop_y, crop_w, crop_h = parts[:4]
                if len(parts) >= 6:
                    output_width, output_height = parts[4], parts[5]
            except ValueError:
                pass

        # Дефолтные значения, если кроп не задан
        if crop_w < _GRID or crop_h < _GRID:
            pad = max(_GRID, round(src_h * _DEFAULT_PAD_FACTOR / _GRID) * _GRID)
            crop_x = 0
            crop_y = -pad
            crop_w = round(src_w / _GRID) * _GRID
            crop_h = round((src_h + pad) / _GRID) * _GRID

        out_w, out_h = crop_w, crop_h

        # Обновляем кэш
        _frame_cache[unique_id] = {
            "width": src_w,
            "height": src_h,
            "image": _tensor_to_jpeg(src),
        }

        time.sleep(0.05)

        src_np = src.cpu().numpy()
        out = np.full((out_h, out_w, 3), 0.5, dtype=np.float32)
        mask = np.ones((out_h, out_w), dtype=np.float32)

        dst_x = max(0, -crop_x)
        dst_y = max(0, -crop_y)
        src_x = max(0, crop_x)
        src_y = max(0, crop_y)

        copy_w = min(src_w - src_x, out_w - dst_x)
        copy_h = min(src_h - src_y, out_h - dst_y)

        if copy_w > 0 and copy_h > 0:
            out[dst_y:dst_y + copy_h, dst_x:dst_x + copy_w] = src_np[src_y:src_y + copy_h, src_x:src_x + copy_w]
            mask[dst_y:dst_y + copy_h, dst_x:dst_x + copy_w] = 0.0

        control_image = torch.from_numpy(out).unsqueeze(0)
        control_mask = torch.from_numpy(mask).unsqueeze(0)

        eff_w = output_width if output_width >= _GRID else out_w
        eff_h = output_height if output_height >= _GRID else out_h

        if eff_w != out_w or eff_h != out_h:
            cv = control_image.permute(0, 3, 1, 2)
            cv = F.interpolate(cv, size=(eff_h, eff_w), mode="bilinear", align_corners=False)
            control_image = cv.permute(0, 2, 3, 1)
            cm = control_mask.unsqueeze(1).float()
            cm = F.interpolate(cm, size=(eff_h, eff_w), mode="nearest")
            control_mask = cm.squeeze(1)

        return (control_image, control_mask, eff_w, eff_h)

NODE_CLASS_MAPPINGS = {"RSOutpaint": RSOutpaint}
NODE_DISPLAY_NAME_MAPPINGS = {"RSOutpaint": "🦊 RS Outpaint"}

if server.PromptServer:
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
                    if crop_state:
                        _PENDING_DECISIONS[node_id]["crop_state"] = crop_state
                        print(f"🦊 [RS Outpaint] Received crop_state: {crop_state}")
                elif decision == "cancel":
                    _PENDING_DECISIONS[node_id]["status"] = "cancelled"
                return web.Response(status=200, text="Decision recorded")
            else:
                return web.Response(status=404, text=f"Node {node_id} not waiting")
        except Exception as e:
            return web.Response(status=500, text=str(e))

    @server.PromptServer.instance.routes.post("/rs_outpaint/cleanup")
    async def rs_outpaint_cleanup(request):
        try:
            data = await request.json()
            node_id = str(data.get("node_id"))
            if node_id in _PENDING_DECISIONS:
                _PENDING_DECISIONS[node_id]["status"] = "removed"
                return web.Response(status=200, text="Cleanup recorded")
            return web.Response(status=200, text="Node not found")
        except Exception as e:
            return web.Response(status=500, text=str(e))

@server.PromptServer.instance.routes.get("/rs_outpaint/info")
async def rs_outpaint_info(request):
    node_id = request.query.get("node_id", "")
    cache_key = str(node_id).strip()
    if not cache_key or cache_key not in _frame_cache:
        return web.Response(status=404, text="No cached image data for this node.")
    cache = _frame_cache[cache_key]
    return web.json_response({
        "width": cache["width"],
        "height": cache["height"],
        "image": base64.b64encode(cache["image"]).decode(),
    })

@server.PromptServer.instance.routes.get("/rs_outpaint/image")
async def rs_outpaint_image(request):
    node_id = request.query.get("node_id", "")
    cache_key = str(node_id).strip()
    if not cache_key or cache_key not in _frame_cache:
        return web.Response(status=404, text="No cached image data for this node.")
    cache = _frame_cache[cache_key]
    return web.Response(body=cache["image"], content_type="image/jpeg")