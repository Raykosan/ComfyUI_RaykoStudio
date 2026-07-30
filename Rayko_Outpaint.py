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

import io
import json
import numpy as np
import server
import torch
from aiohttp import web
from PIL import Image
import time
import os
import folder_paths

_GRID = 16
_MIN_DIM = 32
_DEFAULT_PAD_FACTOR = 0.3

_frame_cache = {}
_PENDING_DECISIONS = {}
_SAVED_CROP_PRESETS = {}
_APPROVED_CROPS = {} 

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PRESET_DIR = os.path.join(CURRENT_DIR, "presets")


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


def _adapt_crop_to_new_size(crop_state, new_w, new_h):
    if not crop_state:
        return None
    try:
        parts = [int(v) for v in str(crop_state).split(",")]
        if len(parts) < 4:
            return None
        cx, cy, cw, ch = parts[0], parts[1], parts[2], parts[3]
        cx = max(-new_w, min(cx, new_w - _GRID))
        cy = max(-new_h, min(cy, new_h - _GRID))
        cw = max(_GRID, min(cw, new_w * 2))
        ch = max(_GRID, min(ch, new_h * 2))

        out_w = parts[4] if len(parts) >= 5 else 0
        out_h = parts[5] if len(parts) >= 6 else 0
        colors = parts[6:9] if len(parts) >= 9 else [255, 0, 0]
        bg_colors = parts[9:12] if len(parts) >= 12 else [20, 20, 20]
        return f"{cx},{cy},{cw},{ch},{out_w},{out_h},{','.join(map(str, colors))},{','.join(map(str, bg_colors))}"
    except Exception:
        return None


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
    DESCRIPTION = "Interactive mask for outpaint with batch preset support"

    @classmethod
    def IS_CHANGED(cls, image, crop_state="", unique_id=None, **kwargs):
        return float("nan")

    def outpaint_prep(self, image, crop_state, unique_id):
        src = image[0] if image.dim() == 4 else image
        src_h, src_w, _ = src.shape

        if src_w < _MIN_DIM or src_h < _MIN_DIM:
            raise ValueError(f"Input image too small ({src_w}×{src_h}).")

        unique_id = str(unique_id)

        try:
            src_hash = _tensor_hash(src)
            cached = _frame_cache.get(unique_id, {})
            is_new_image = (cached.get("src_hash") != src_hash or
                            cached.get("width") != src_w or
                            cached.get("height") != src_h)

            saved_preset = _SAVED_CROP_PRESETS.get(unique_id, {})
            batch_mode_active = saved_preset.get("active", False)
            batch_mode_type = saved_preset.get("mode", "single")

            auto_apply = False
            if batch_mode_active and saved_preset.get("crop_state"):
                if batch_mode_type == "multi":
                    auto_apply = True
                elif batch_mode_type == "single" and not is_new_image:
                    auto_apply = True

            if not auto_apply:
                approved_crop = _APPROVED_CROPS.get(unique_id, {}).get(src_hash)
                if approved_crop and not is_new_image:
                    crop_state = approved_crop
                    auto_apply = True

            if auto_apply:
                if not batch_mode_active:
                    pass
                else:
                    crop_state = _adapt_crop_to_new_size(saved_preset["crop_state"], src_w, src_h)

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
                        "image_height": img.height,
                        "is_new_image": is_new_image,
                        "src_hash": src_hash,
                        "auto_approved": True,
                        "applied_crop_state": crop_state
                    })
                except Exception:
                    pass
            else:
                if is_new_image:
                    if unique_id in _frame_cache:
                        del _frame_cache[unique_id]
                    crop_state = ""

                _frame_cache[unique_id] = {
                    "width": src_w,
                    "height": src_h,
                    "src_hash": src_hash,
                    "image": _tensor_to_jpeg(src)
                }

                if unique_id not in _PENDING_DECISIONS:
                    _PENDING_DECISIONS[unique_id] = {
                        "status": "pending",
                        "crop_state": crop_state,
                        "last_heartbeat": time.time()
                    }
                else:
                    _PENDING_DECISIONS[unique_id]["status"] = "pending"
                    _PENDING_DECISIONS[unique_id]["crop_state"] = crop_state
                    _PENDING_DECISIONS[unique_id]["last_heartbeat"] = time.time()

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
                        "image_height": img.height,
                        "is_new_image": is_new_image,
                        "src_hash": src_hash
                    })
                except Exception:
                    pass

                while True:
                    state = _PENDING_DECISIONS.get(unique_id, {})
                    current_status = state.get("status", "pending")
                    current_crop_state = state.get("crop_state", crop_state)
                    last_hb = state.get("last_heartbeat", time.time())

                    if current_status == "approved":
                        crop_state = current_crop_state
                        if unique_id not in _APPROVED_CROPS:
                            _APPROVED_CROPS[unique_id] = {}
                        _APPROVED_CROPS[unique_id][src_hash] = crop_state
                        break
                    elif current_status == "cancelled":
                        if unique_id in _APPROVED_CROPS and src_hash:
                            _APPROVED_CROPS[unique_id].pop(src_hash, None)
                            if not _APPROVED_CROPS[unique_id]:
                                del _APPROVED_CROPS[unique_id]
                        return (torch.zeros((1, src_h, src_w, 3)), torch.ones((1, src_h, src_w)), torch.zeros((1, src_h, src_w, 3)), 0, 0)
                    elif current_status == "removed":
                        return (image, torch.ones((1, src_h, src_w)), image, src_w, src_h)
                    elif time.time() - last_hb > 10.0:
                        return (image, torch.ones((1, src_h, src_w)), image, src_w, src_h)
                    elif current_status == "rejected":
                        _PENDING_DECISIONS[unique_id]["status"] = "pending"
                        crop_state = current_crop_state

                    time.sleep(0.2)

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

            if use_crop_state and (output_width == 0 or output_height == 0):
                output_width = crop_w
                output_height = crop_h

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
            if eff_w < 32:
                eff_w = src_w
            if eff_h < 32:
                eff_h = src_h

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
            norm_color = torch.tensor([color_r / 255.0, color_g / 255.0, color_b / 255.0]).view(1, 1, 1, 3)
            norm_bg = torch.tensor([bg_r / 255.0, bg_g / 255.0, bg_b / 255.0]).view(1, 1, 1, 3)
            mask_exp = control_mask.unsqueeze(3)
            mask_image = mask_exp * norm_color + (1.0 - mask_exp) * norm_bg
            mask_image = torch.clamp(mask_image, 0.0, 1.0)

            return (control_image, control_mask, mask_image, eff_w, eff_h)

        finally:
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
        batch_mode = data.get("batch_mode", False)
        batch_type = data.get("batch_type", "single")

        if node_id in _PENDING_DECISIONS:
            if decision == "approve":
                _PENDING_DECISIONS[node_id]["status"] = "approved"
                if crop_state:
                    _PENDING_DECISIONS[node_id]["crop_state"] = crop_state
                _PENDING_DECISIONS[node_id]["batch_mode"] = batch_mode
                if batch_mode and crop_state:
                    _SAVED_CROP_PRESETS[node_id] = {
                        "crop_state": crop_state,
                        "active": True,
                        "mode": batch_type
                    }
            elif decision == "cancel":
                _PENDING_DECISIONS[node_id]["status"] = "cancelled"
                if node_id in _SAVED_CROP_PRESETS:
                    del _SAVED_CROP_PRESETS[node_id]
            return web.Response(status=200, text="OK")
        return web.Response(status=404, text="Not waiting")
    except Exception as e:
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/rs_outpaint/unapprove")
async def rs_outpaint_unapprove(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        src_hash = data.get("src_hash")
        if node_id in _APPROVED_CROPS and src_hash:
            _APPROVED_CROPS[node_id].pop(src_hash, None)
            if not _APPROVED_CROPS[node_id]:
                del _APPROVED_CROPS[node_id]
        return web.Response(status=200, text="OK")
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
        if node_id in _APPROVED_CROPS:
            del _APPROVED_CROPS[node_id]
        if node_id in _frame_cache:
            del _frame_cache[node_id]
        if node_id in _SAVED_CROP_PRESETS:
            del _SAVED_CROP_PRESETS[node_id]
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


@server.PromptServer.instance.routes.post("/rs_outpaint/batch_toggle")
async def rs_outpaint_batch_toggle(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        batch_type = data.get("batch_type", "single")
        enabled = data.get("enabled", True)

        if node_id in _SAVED_CROP_PRESETS:
            _SAVED_CROP_PRESETS[node_id]["active"] = enabled
            _SAVED_CROP_PRESETS[node_id]["mode"] = batch_type
        elif enabled and node_id in _PENDING_DECISIONS:
            crop_state = _PENDING_DECISIONS[node_id].get("crop_state")
            if crop_state:
                _SAVED_CROP_PRESETS[node_id] = {
                    "crop_state": crop_state,
                    "active": True,
                    "mode": batch_type
                }
        return web.Response(status=200, text="OK")
    except Exception as e:
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/rs_outpaint/clear_preset")
async def rs_outpaint_clear_preset(request):
    """Очищает только батч-пресет. Используется в обычном режиме."""
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        if node_id in _SAVED_CROP_PRESETS:
            del _SAVED_CROP_PRESETS[node_id]
        return web.Response(status=200, text="OK")
    except Exception as e:
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/rs_outpaint/clear_all")
async def rs_outpaint_clear_all(request):
    """Очищает батч-пресет и кэш утверждённых кропов. Используется после завершения батча."""
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        if node_id in _SAVED_CROP_PRESETS:
            del _SAVED_CROP_PRESETS[node_id]
        if node_id in _APPROVED_CROPS:
            del _APPROVED_CROPS[node_id]
        return web.Response(status=200, text="OK")
    except Exception as e:
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/rs_outpaint/save_preset")
async def rs_outpaint_save_preset(request):
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        if not name:
            return web.Response(status=400, text="Name required")
        name = "".join(c for c in name if c.isalnum() or c in " _-").strip()
        if not name:
            return web.Response(status=400, text="Invalid name")

        os.makedirs(PRESET_DIR, exist_ok=True)

        filepath = os.path.join(PRESET_DIR, f"{name}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data.get("preset_data", {}), f, indent=2)
        return web.Response(status=200, text="OK")
    except Exception as e:
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/rs_outpaint/list_presets")
async def rs_outpaint_list_presets(request):
    try:
        presets = []
        if os.path.exists(PRESET_DIR):
            presets = [f[:-5] for f in os.listdir(PRESET_DIR) if f.endswith('.json')]
        return web.json_response(presets)
    except Exception as e:
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/rs_outpaint/load_preset")
async def rs_outpaint_load_preset(request):
    try:
        data = await request.json()
        name = data.get("name")
        filepath = os.path.join(PRESET_DIR, f"{name}.json")
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return web.json_response(json.load(f))
        return web.Response(status=404, text="Preset not found")
    except Exception as e:
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/rs_outpaint/delete_preset")
async def rs_outpaint_delete_preset(request):
    try:
        data = await request.json()
        name = data.get("name")
        if not name:
            return web.Response(status=400, text="Name required")
        filepath = os.path.join(PRESET_DIR, f"{name}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            return web.Response(status=200, text="OK")
        return web.Response(status=404, text="Preset not found")
    except Exception as e:
        return web.Response(status=500, text=str(e))