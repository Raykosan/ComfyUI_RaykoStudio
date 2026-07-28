# SPDX-License-Identifier: Apache-2.0
# Copyright 2025-2026 Raykosan (RaykoStudio)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use th is file except in compliance with the License.
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
import torch
import numpy as np
import cv2
import json
import time
import folder_paths
from PIL import Image
from collections import OrderedDict
from server import PromptServer
from aiohttp import web
import aiohttp

class LRUCache:
    def __init__(self, max_size: int = 50):
        self.cache = OrderedDict()
        self.max_size = max_size

    def get(self, key):
        if key not in self.cache:
            return None
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.max_size:
            self.cache.popitem(last=False)

    def clear(self):
        self.cache.clear()

PENDING_ADJUSTMENTS = LRUCache(max_size=50)
PREVIEW_CACHE = LRUCache(max_size=20)
LUT_CACHE = LRUCache(max_size=10)

def tensor2pil(tensor):
    arr = (tensor.cpu().numpy() * 255.0).astype(np.uint8)
    if arr.ndim == 4:
        arr = arr[0]
    if arr.shape[2] >= 4:
        return Image.fromarray(arr[:, :, :4], 'RGBA').convert('RGB')
    return Image.fromarray(arr, 'RGB')

def pil2tensor(pil_img):
    arr = np.array(pil_img).astype(np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)

def apply_basic_adjustments(img_bgr, brightness, contrast, hue, saturation):
    if brightness != 0 or contrast != 0:
        alpha = 1.0 + (contrast / 100.0)
        beta = brightness
        img_bgr = img_bgr.astype(np.float32)
        img_bgr = img_bgr * alpha + beta
        img_bgr = np.clip(img_bgr, 0, 255).astype(np.uint8)
    
    if hue != 0 or saturation != 0:
        img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
        img_hsv[:, :, 0] = (img_hsv[:, :, 0] + hue) % 180
        img_hsv[:, :, 1] = np.clip(img_hsv[:, :, 1] * (1.0 + saturation / 100.0), 0, 255)
        img_bgr = cv2.cvtColor(img_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    
    return img_bgr

def apply_sharpen(img_bgr, amount):
    if amount <= 0:
        return img_bgr
    
    amount = min(amount, 200) / 100.0
    blurred = cv2.GaussianBlur(img_bgr, (0, 0), 3)
    sharpened = cv2.addWeighted(img_bgr, 1.0 + amount, blurred, -amount, 0)
    return sharpened

def apply_vibrance(img_bgr, amount):
    if amount == 0:
        return img_bgr
    
    amount = amount / 100.0
    img_float = img_bgr.astype(np.float32) / 255.0
    
    max_rgb = np.max(img_float, axis=2)
    avg_rgb = np.mean(img_float, axis=2)
    saturation = max_rgb - avg_rgb
    
    mask = 1.0 - saturation
    
    result = img_float.copy()
    for c in range(3):
        result[:, :, c] = img_float[:, :, c] + (img_float[:, :, c] - avg_rgb[:, :, np.newaxis][:, :, 0]) * amount * mask
    
    result = np.clip(result * 255, 0, 255).astype(np.uint8)
    return result

def apply_clarity(img_bgr, amount):
    if amount == 0:
        return img_bgr
    
    amount = amount / 100.0
    blurred = cv2.GaussianBlur(img_bgr, (0, 0), 30)
    clarified = cv2.addWeighted(img_bgr, 1.0 + amount, blurred, -amount, 0)
    return clarified

def parse_cube_lut(lut_path):
    try:
        mtime = os.path.getmtime(lut_path)
        cache_key = f"{lut_path}_{int(mtime)}"
    except:
        cache_key = lut_path
    
    cached = LUT_CACHE.get(cache_key)
    if cached is not None:
        return cached
    
    with open(lut_path, 'r') as f:
        lines = f.readlines()
    
    size = 33
    lut_data = []
    for line in lines:
        line = line.strip()
        if line.startswith('LUT_3D_SIZE'):
            size = int(line.split()[1])
        elif line and not line.startswith('#') and not line.startswith('TITLE') and not line.startswith('DOMAIN'):
            try:
                lut_data.append([float(x) for x in line.split()])
            except ValueError:
                continue
    
    lut_array = np.array(lut_data, dtype=np.float32).reshape((size, size, size, 3))
    lut_array = np.transpose(lut_array, (2, 1, 0, 3))
    LUT_CACHE.put(cache_key, lut_array)
    return lut_array

def apply_lut(img_bgr, lut_path, intensity):
    if intensity <= 0.01:
        return img_bgr
    
    if not os.path.exists(lut_path):
        temp_dir = folder_paths.get_temp_directory()
        full_path = os.path.join(temp_dir, "rs_adjustments", lut_path)
        if not os.path.exists(full_path):
            return img_bgr
        lut_path = full_path
    
    lut_array = parse_cube_lut(lut_path)
    size = lut_array.shape[0]
    
    img_float = img_bgr.astype(np.float32) / 255.0
    img_rgb = img_float[:, :, ::-1]
    
    coords = img_rgb * (size - 1)
    idx = np.floor(coords).astype(np.int32)
    idx = np.clip(idx, 0, size - 2)
    frac = coords - idx
    
    i0, i1 = idx[:, :, 0], idx[:, :, 0] + 1
    j0, j1 = idx[:, :, 1], idx[:, :, 1] + 1
    k0, k1 = idx[:, :, 2], idx[:, :, 2] + 1
    
    f0, f1, f2 = frac[:, :, 0], frac[:, :, 1], frac[:, :, 2]
    
    w000 = (1 - f0) * (1 - f1) * (1 - f2)
    w001 = (1 - f0) * (1 - f1) * f2
    w010 = (1 - f0) * f1 * (1 - f2)
    w011 = (1 - f0) * f1 * f2
    w100 = f0 * (1 - f1) * (1 - f2)
    w101 = f0 * (1 - f1) * f2
    w110 = f0 * f1 * (1 - f2)
    w111 = f0 * f1 * f2
    
    result = np.zeros_like(img_rgb)
    for c in range(3):
        lut_c = lut_array[:, :, :, c]
        result[:, :, c] = (
            w000 * lut_c[i0, j0, k0] +
            w001 * lut_c[i0, j0, k1] +
            w010 * lut_c[i0, j1, k0] +
            w011 * lut_c[i0, j1, k1] +
            w100 * lut_c[i1, j0, k0] +
            w101 * lut_c[i1, j0, k1] +
            w110 * lut_c[i1, j1, k0] +
            w111 * lut_c[i1, j1, k1]
        )
    
    result = np.clip(result, 0, 1)
    result_bgr = result[:, :, ::-1]
    
    if intensity < 1.0:
        result_bgr = img_float * (1.0 - intensity) + result_bgr * intensity
        return np.clip(result_bgr * 255, 0, 255).astype(np.uint8)
    
    return (result_bgr * 255).astype(np.uint8)

def apply_levels(img_bgr, input_black, gamma, input_white):
    if input_black == 0 and gamma == 1.0 and input_white == 255:
        return img_bgr
    
    img_float = img_bgr.astype(np.float32) / 255.0
    in_min = input_black / 255.0
    in_max = input_white / 255.0
    in_range = max(0.001, in_max - in_min)
    
    normalized = (img_float - in_min) / in_range
    normalized = np.clip(normalized, 0, 1)
    
    if gamma != 1.0:
        normalized = np.power(normalized, 1.0 / gamma)
    
    result = (normalized * 255).astype(np.uint8)
    return result

def apply_exposure(img_bgr, exposure, offset):
    if exposure == 0 and offset == 0:
        return img_bgr
    
    img_float = img_bgr.astype(np.float32) / 255.0
    multiplier = 2.0 ** (exposure / 100.0)
    img_float = img_float * multiplier + (offset / 100.0)
    
    result = np.clip(img_float * 255, 0, 255).astype(np.uint8)
    return result

def apply_color_balance(img_bgr, shadows_cyan_red, shadows_magenta_green, shadows_yellow_blue,
                        midtones_cyan_red, midtones_magenta_green, midtones_yellow_blue,
                        highlights_cyan_red, highlights_magenta_green, highlights_yellow_blue):
    if all(v == 0 for v in [shadows_cyan_red, shadows_magenta_green, shadows_yellow_blue,
                            midtones_cyan_red, midtones_magenta_green, midtones_yellow_blue,
                            highlights_cyan_red, highlights_magenta_green, highlights_yellow_blue]):
        return img_bgr
    
    img_float = img_bgr.astype(np.float32) / 255.0
    luminance = 0.299 * img_float[:, :, 2] + 0.587 * img_float[:, :, 1] + 0.114 * img_float[:, :, 0]
    
    shadows_mask = np.clip(1.0 - luminance * 2.0, 0, 1)[:, :, np.newaxis]
    midtones_mask = np.clip(1.0 - np.abs(luminance - 0.5) * 4.0, 0, 1)[:, :, np.newaxis]
    highlights_mask = np.clip(luminance * 2.0 - 1.0, 0, 1)[:, :, np.newaxis]
    
    result = img_float.copy()
    
    result[:, :, 2] += shadows_mask[:, :, 0] * (shadows_cyan_red / 100.0)
    result[:, :, 1] += shadows_mask[:, :, 0] * (shadows_magenta_green / 100.0)
    result[:, :, 0] += shadows_mask[:, :, 0] * (shadows_yellow_blue / 100.0)
    
    result[:, :, 2] += midtones_mask[:, :, 0] * (midtones_cyan_red / 100.0)
    result[:, :, 1] += midtones_mask[:, :, 0] * (midtones_magenta_green / 100.0)
    result[:, :, 0] += midtones_mask[:, :, 0] * (midtones_yellow_blue / 100.0)
    
    result[:, :, 2] += highlights_mask[:, :, 0] * (highlights_cyan_red / 100.0)
    result[:, :, 1] += highlights_mask[:, :, 0] * (highlights_magenta_green / 100.0)
    result[:, :, 0] += highlights_mask[:, :, 0] * (highlights_yellow_blue / 100.0)
    
    result = np.clip(result * 255, 0, 255).astype(np.uint8)
    return result

def apply_black_and_white(img_bgr, red, yellow, green, cyan, blue, magenta):
    img_float = img_bgr.astype(np.float32) / 255.0
    img_rgb = img_float[:, :, ::-1]
    img_hsv = cv2.cvtColor((img_rgb * 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
    hue = img_hsv[:, :, 0].astype(np.float32) * 2.0

    w_red = red / 100.0
    w_yellow = yellow / 100.0
    w_green = green / 100.0
    w_cyan = cyan / 100.0
    w_blue = blue / 100.0
    w_magenta = magenta / 100.0

    ref_hues = np.array([0, 30, 60, 90, 120, 150], dtype=np.float32)
    ref_weights = np.array([
        [w_red, 0, 0],
        [w_yellow, w_yellow, 0],
        [0, w_green, 0],
        [0, w_cyan, w_cyan],
        [0, 0, w_blue],
        [w_magenta, 0, w_magenta]
    ], dtype=np.float32)

    ref_hues_ext = np.array([0, 30, 60, 90, 120, 150, 360])
    ref_weights_ext = np.concatenate([ref_weights, ref_weights[:1]], axis=0)

    hue_norm = hue % 360
    idx = np.digitize(hue_norm, ref_hues_ext, right=False) - 1
    idx = np.clip(idx, 0, 5)

    left_weights = ref_weights[idx]
    right_weights = ref_weights_ext[idx + 1]
    left_angle = ref_hues[idx]
    right_angle = ref_hues_ext[idx + 1]
    t = (hue_norm - left_angle) / (right_angle - left_angle + 1e-6)
    weights = left_weights + t[:, :, np.newaxis] * (right_weights - left_weights)

    r = img_rgb[:, :, 0]
    g = img_rgb[:, :, 1]
    b = img_rgb[:, :, 2]
    gray = r * weights[:, :, 0] + g * weights[:, :, 1] + b * weights[:, :, 2]
    gray = np.clip(gray, 0, 1)

    result = (gray * 255).astype(np.uint8)
    result_bgr = cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)
    return result_bgr

def apply_channel_mixer(img_bgr, red_red, red_green, red_blue,
                        green_red, green_green, green_blue,
                        blue_red, blue_green, blue_blue):
    if (red_red == 100 and red_green == 0 and red_blue == 0 and
        green_red == 0 and green_green == 100 and green_blue == 0 and
        blue_red == 0 and blue_green == 0 and blue_blue == 100):
        return img_bgr
    
    img_float = img_bgr.astype(np.float32) / 255.0
    img_rgb = img_float[:, :, ::-1]
    
    r, g, b = img_rgb[:, :, 0], img_rgb[:, :, 1], img_rgb[:, :, 2]
    
    new_r = (r * (red_red / 100.0) + g * (red_green / 100.0) + b * (red_blue / 100.0))
    new_g = (r * (green_red / 100.0) + g * (green_green / 100.0) + b * (green_blue / 100.0))
    new_b = (r * (blue_red / 100.0) + g * (blue_green / 100.0) + b * (blue_blue / 100.0))
    
    result_rgb = np.stack([new_r, new_g, new_b], axis=-1)
    result_rgb = np.clip(result_rgb, 0, 1)
    result_bgr = (result_rgb[:, :, ::-1] * 255).astype(np.uint8)
    
    return result_bgr

def apply_selective_color(img_bgr, color_name, cyan, magenta, yellow, black):
    if cyan == 0 and magenta == 0 and yellow == 0 and black == 0:
        return img_bgr
    
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    
    h_deg = img_hsv[:, :, 0] * 2.0
    s_norm = img_hsv[:, :, 1] / 255.0
    v_norm = img_hsv[:, :, 2] / 255.0
    
    color_centers = {
        "Reds": 0, "Yellows": 60, "Greens": 120, 
        "Cyans": 180, "Blues": 240, "Magentas": 300
    }
    
    if color_name in color_centers:
        center = color_centers[color_name]
        diff = np.abs(h_deg - center)
        diff = np.minimum(diff, 360.0 - diff)
        mask_h = np.exp(-(diff ** 2) / (2 * 40.0 ** 2))
        mask_s = 1.0 - np.exp(-(s_norm ** 2) / (2 * 0.15 ** 2))
        mask = mask_h * mask_s
    else:
        if color_name == "Whites":
            mask_v = np.exp(-((v_norm - 1.0) ** 2) / (2 * 0.15 ** 2))
            mask_s = np.exp(-(s_norm ** 2) / (2 * 0.25 ** 2))
            mask = mask_v * mask_s
        elif color_name == "Neutrals":
            mask_v = np.exp(-((v_norm - 0.5) ** 2) / (2 * 0.15 ** 2))
            mask_s = np.exp(-(s_norm ** 2) / (2 * 0.25 ** 2))
            mask = mask_v * mask_s
        elif color_name == "Blacks":
            mask_v = np.exp(-(v_norm ** 2) / (2 * 0.15 ** 2))
            mask_s = np.exp(-(s_norm ** 2) / (2 * 0.25 ** 2))
            mask = mask_v * mask_s
        else:
            mask = np.zeros_like(h_deg)

    c, m, y, k = cyan / 100.0, magenta / 100.0, yellow / 100.0, black / 100.0
    
    img_rgb[:, :, 0] += mask * (-c - k)  # Red: Cyan уменьшает Red, Black уменьшает все
    img_rgb[:, :, 1] += mask * (-m - k)  # Green: Magenta уменьшает Green
    img_rgb[:, :, 2] += mask * (-y - k)  # Blue: Yellow уменьшает Blue
    
    img_rgb = np.clip(img_rgb, 0, 1)
    result_bgr = (cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR) * 255).astype(np.uint8)
    return result_bgr

def process_image(img_bgr, adjustments):
    brightness = adjustments.get("brightness", 0)
    contrast = adjustments.get("contrast", 0)
    hue = adjustments.get("hue", 0)
    saturation = adjustments.get("saturation", 0)
    
    result_bgr = apply_basic_adjustments(img_bgr, brightness, contrast, hue, saturation)
    
    sharpen = adjustments.get("sharpen", 0)
    if sharpen != 0:
        result_bgr = apply_sharpen(result_bgr, sharpen)
    
    lut_path = adjustments.get("lut_path", "")
    lut_intensity = adjustments.get("lut_intensity", 100)
    if lut_path:
        result_bgr = apply_lut(result_bgr, lut_path, lut_intensity / 100.0)

    vibrance = adjustments.get("vibrance", 0)
    if vibrance != 0:
        result_bgr = apply_vibrance(result_bgr, vibrance)
    
    clarity = adjustments.get("clarity", 0)
    if clarity != 0:
        result_bgr = apply_clarity(result_bgr, clarity)
    
    levels = adjustments.get("levels", {})
    result_bgr = apply_levels(
        result_bgr,
        levels.get("input_black", 0),
        levels.get("gamma", 1.0),
        levels.get("input_white", 255)
    )
    
    exposure = adjustments.get("exposure", {})
    result_bgr = apply_exposure(
        result_bgr,
        exposure.get("exposure", 0),
        exposure.get("offset", 0)
    )
    
    color_balance = adjustments.get("color_balance", {})
    result_bgr = apply_color_balance(
        result_bgr,
        color_balance.get("shadows_cyan_red", 0),
        color_balance.get("shadows_magenta_green", 0),
        color_balance.get("shadows_yellow_blue", 0),
        color_balance.get("midtones_cyan_red", 0),
        color_balance.get("midtones_magenta_green", 0),
        color_balance.get("midtones_yellow_blue", 0),
        color_balance.get("highlights_cyan_red", 0),
        color_balance.get("highlights_magenta_green", 0),
        color_balance.get("highlights_yellow_blue", 0)
    )
    
    bw = adjustments.get("black_white", {})
    bw_enabled = adjustments.get("bw_enabled", False)
    if bw_enabled:
        result_bgr = apply_black_and_white(
            result_bgr,
            bw.get("bw_red", 40),
            bw.get("bw_yellow", 60),
            bw.get("bw_green", 40),
            bw.get("bw_cyan", 60),
            bw.get("bw_blue", 20),
            bw.get("bw_magenta", 80)
        )

    channel_mixer = adjustments.get("channel_mixer", {})
    result_bgr = apply_channel_mixer(
        result_bgr,
        channel_mixer.get("red_red", 100),
        channel_mixer.get("red_green", 0),
        channel_mixer.get("red_blue", 0),
        channel_mixer.get("green_red", 0),
        channel_mixer.get("green_green", 100),
        channel_mixer.get("green_blue", 0),
        channel_mixer.get("blue_red", 0),
        channel_mixer.get("blue_green", 0),
        channel_mixer.get("blue_blue", 100)
    )
    
    selective_color = adjustments.get("selective_color", {})
    result_bgr = apply_selective_color(
        result_bgr,
        selective_color.get("color_name", "Reds"),
        selective_color.get("sc_cyan", 0),
        selective_color.get("sc_magenta", 0),
        selective_color.get("sc_yellow", 0),
        selective_color.get("sc_black", 0)
    )
    
    return result_bgr

def cleanup_temp_files(node_id, temp_dir, exclude_file=None):
    prefix = f"rs_adjustments_{node_id}_"
    for f in os.listdir(temp_dir):
        if f.startswith(prefix) and f != exclude_file:
            try:
                os.remove(os.path.join(temp_dir, f))
            except:
                pass

@PromptServer.instance.routes.post("/rayko/rs_adjustments")
async def adjustments_handler(request):
    try:
        data = await request.json()
        node_id = str(data.get("id"))
        adjustments = data.get("adjustments", {})
        
        if node_id is None or adjustments is None:
            return web.json_response({"error": "Missing data"}, status=400)
        
        PENDING_ADJUSTMENTS.put(node_id, {
            "status": "completed",
            "adjustments": adjustments
        })
        
        temp_dir = folder_paths.get_temp_directory()
        cleanup_temp_files(node_id, temp_dir)
        
        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_adjustments/cancel")
async def cancel_handler(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        if node_id:
            PENDING_ADJUSTMENTS.put(node_id, {"status": "cancelled"})
            temp_dir = folder_paths.get_temp_directory()
            cleanup_temp_files(node_id, temp_dir)
        return web.json_response({"status": "cancelled"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/rayko/rs_adjustments/preview")
async def preview_handler(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id", "unknown"))
        adjustments = data.get("adjustments", {})
        image_file = data.get("image_file", "")
        
        cache_key = f"{node_id}_{image_file}_{json.dumps(adjustments, sort_keys=True)}"
        cached = PREVIEW_CACHE.get(cache_key)
        if cached:
            return web.json_response(cached)
        
        temp_dir = folder_paths.get_temp_directory()
        img_path = os.path.join(temp_dir, image_file)
        
        if not os.path.exists(img_path):
            return web.json_response({"error": "Image not found"}, status=404)
        
        img_pil = Image.open(img_path).convert('RGB')
        img_bgr = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
        
        result_bgr = process_image(img_bgr, adjustments)
        
        ts = int(time.time() * 1000)
        filename = f"rs_adjustments_{node_id}_{ts}_preview.png"
        filepath = os.path.join(temp_dir, filename)
        
        result_pil = Image.fromarray(cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB))
        result_pil.save(filepath)
        
        response_data = {
            "preview_file": filename,
            "timestamp": ts
        }
        
        PREVIEW_CACHE.put(cache_key, response_data)
        
        return web.json_response(response_data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/rayko/rs_adjustments/ws")
async def ws_preview_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    print("[RS Adjustments] WebSocket connection opened")
    
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    node_id = str(data.get("node_id", "unknown"))
                    adjustments = data.get("adjustments", {})
                    image_file = data.get("image_file", "")
                    
                    temp_dir = folder_paths.get_temp_directory()
                    img_path = os.path.join(temp_dir, image_file)
                    
                    if not os.path.exists(img_path):
                        await ws.send_json({"error": "Image not found"})
                        continue
                    
                    img_pil = Image.open(img_path).convert('RGB')
                    img_bgr = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
                    
                    max_size = 1024
                    h, w = img_bgr.shape[:2]
                    if h > max_size or w > max_size:
                        scale = max_size / max(h, w)
                        new_w = int(w * scale)
                        new_h = int(h * scale)
                        img_bgr = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
                    
                    result_bgr = process_image(img_bgr, adjustments)
                    
                    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 90]
                    _, jpeg_buffer = cv2.imencode('.jpg', result_bgr, encode_param)
                    jpeg_bytes = jpeg_buffer.tobytes()
                    
                    await ws.send_bytes(jpeg_bytes)
                    
                except Exception as e:
                    print(f"[RS Adjustments] WebSocket error: {e}")
                    import traceback
                    traceback.print_exc()
                    await ws.send_json({"error": str(e)})
            
            elif msg.type == aiohttp.WSMsgType.ERROR:
                print(f"[RS Adjustments] WebSocket error: {ws.exception()}")
    
    except Exception as e:
        print(f"[RS Adjustments] WebSocket connection error: {e}")
    
    print("[RS Adjustments] WebSocket connection closed")
    return ws

class RS_ImageAdjustments:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "brightness": ("INT", {"default": 0, "min": -100, "max": 100, "step": 1}),
                "contrast": ("INT", {"default": 0, "min": -100, "max": 100, "step": 1}),
                "sharpen": ("INT", {"default": 0, "min": 0, "max": 200, "step": 1}),
                "hue": ("INT", {"default": 0, "min": -180, "max": 180, "step": 1}),
                "saturation": ("INT", {"default": 0, "min": -100, "max": 100, "step": 1}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "advanced_params": "STRING"
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "apply_adjustments"
    CATEGORY = "🦊 RaykoStudio"
    OUTPUT_NODE = True
    DESCRIPTION = "Interactive image adjustments with real-time preview"

    def apply_adjustments(self, image, brightness, contrast, sharpen, hue, saturation, unique_id=None, advanced_params=None):
        unique_id = str(unique_id) if unique_id is not None else "unknown"
        
        if image.numel() == 0:
            return (image,)
        
        h, w = image.shape[1], image.shape[2]
        if h < 8 or w < 8:
            return (image,)
        
        PENDING_ADJUSTMENTS.cache.pop(unique_id, None)
        
        bg_pil = tensor2pil(image)
        bg_w, bg_h = bg_pil.size
        
        ts = int(time.time() * 1000)
        td = folder_paths.get_temp_directory()
        
        bfn = f"rs_adjustments_{unique_id}_{ts}_bg.png"
        bg_pil.save(os.path.join(td, bfn))
        
        cleanup_temp_files(unique_id, td, exclude_file=bfn)
        
        PENDING_ADJUSTMENTS.put(unique_id, {"status": "pending"})
        
        time.sleep(0.5)
        
        PromptServer.instance.send_sync("rs-adjustments-start", {
            "id": unique_id,
            "bg_file": bfn,
            "bg_width": bg_w,
            "bg_height": bg_h,
            "timestamp": ts,
            "brightness": brightness,
            "contrast": contrast,
            "sharpen": sharpen,
            "hue": hue,
            "saturation": saturation,
            "advanced_params": advanced_params or "{}"
        })
        
        print(f"[RS Image Adjustments] Node {unique_id} waiting for user input (Apply/Cancel)...")
        
        while unique_id not in PENDING_ADJUSTMENTS.cache or PENDING_ADJUSTMENTS.cache[unique_id].get("status") == "pending":
            if unique_id in PENDING_ADJUSTMENTS.cache and PENDING_ADJUSTMENTS.cache[unique_id].get("status") == "cancelled":
                break
            time.sleep(0.05)
        
        if unique_id in PENDING_ADJUSTMENTS.cache:
            if PENDING_ADJUSTMENTS.cache[unique_id].get("status") == "cancelled":
                print(f"[RS Image Adjustments] Cancelled by user for node {unique_id}")
                PENDING_ADJUSTMENTS.cache.pop(unique_id, None)
                cleanup_temp_files(unique_id, td)
                return (image,)
        
        print(f"[RS Image Adjustments] Input received for node {unique_id}")
        
        data = PENDING_ADJUSTMENTS.cache.pop(unique_id, None)
        if data is None:
            cleanup_temp_files(unique_id, td)
            return (image,)
        
        adjustments = data.get("adjustments", {})
        
        brightness = adjustments.get("brightness", brightness)
        contrast = adjustments.get("contrast", contrast)
        sharpen = adjustments.get("sharpen", sharpen)
        hue = adjustments.get("hue", hue)
        saturation = adjustments.get("saturation", saturation)
        
        img_bgr = cv2.cvtColor(np.array(bg_pil), cv2.COLOR_RGB2BGR)
        
        adjustments["brightness"] = brightness
        adjustments["contrast"] = contrast
        adjustments["sharpen"] = sharpen
        adjustments["hue"] = hue
        adjustments["saturation"] = saturation
        
        result_bgr = process_image(img_bgr, adjustments)
        
        result_pil = Image.fromarray(cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB))
        
        cleanup_temp_files(unique_id, td)
        
        return (pil2tensor(result_pil),)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return time.time()

NODE_CLASS_MAPPINGS = {"RS_ImageAdjustments": RS_ImageAdjustments}
NODE_DISPLAY_NAME_MAPPINGS = {"RS_ImageAdjustments": "🦊 RS Image Adjustments"}