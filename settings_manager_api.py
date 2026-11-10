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
import sys
import json
import shutil
import datetime
import logging
import re
from aiohttp import web
from server import PromptServer

logger = logging.getLogger(__name__)

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
COMFYUI_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))
SETTINGS_FILE = os.path.join(COMFYUI_ROOT, "user", "default", "comfy.settings.json")
BACKUP_DIR = os.path.join(os.path.expanduser("~"), "Documents", "ComfyUI_Settings_Backups")
PRESETS_DIR = os.path.join(CURRENT_DIR, "presets_workflow")

os.makedirs(BACKUP_DIR, exist_ok=True)
os.makedirs(PRESETS_DIR, exist_ok=True)
logger.info("🦊 Settings Manager initialized")
logger.info(f"🦊 Presets folder: {PRESETS_DIR}")


# -------------------- Settings Backups --------------------

@PromptServer.instance.routes.get("/rayko_settings_manager/ping")
async def ping(request):
    return web.json_response({"status": "ok"})


@PromptServer.instance.routes.post("/rayko_settings_manager/save")
async def save_settings(request):
    try:
        if not os.path.exists(SETTINGS_FILE):
            return web.json_response({"error": "Settings file not found"}, status=404)

        try:
            data = await request.json()
            custom_name = data.get('backup_name', '').strip()
        except Exception:
            custom_name = ''

        sanitized_name = re.sub(r'[<>:"/\\|?*]', '_', custom_name).rstrip('. ')

        if not sanitized_name:
            folder_name = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        else:
            folder_name = sanitized_name
            counter = 1
            while os.path.exists(os.path.join(BACKUP_DIR, folder_name)):
                folder_name = f"{sanitized_name}_{counter}"
                counter += 1

        target_folder = os.path.join(BACKUP_DIR, folder_name)
        os.makedirs(target_folder, exist_ok=True)
        shutil.copy2(SETTINGS_FILE, target_folder)

        return web.json_response({"success": True, "folder": folder_name})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/rayko_settings_manager/list")
async def list_settings(request):
    try:
        if not os.path.exists(BACKUP_DIR):
            return web.json_response({"success": True, "backups": []})

        backups = [d for d in os.listdir(BACKUP_DIR) if os.path.isdir(os.path.join(BACKUP_DIR, d))]
        backups.sort(reverse=True)
        return web.json_response({"success": True, "backups": backups})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/rayko_settings_manager/restore")
async def restore_settings(request):
    try:
        data = await request.json()
        backup_name = data.get("backup_name")

        if not backup_name:
            return web.json_response({"error": "Backup name not specified"}, status=400)

        backup_file = os.path.join(BACKUP_DIR, backup_name, "comfy.settings.json")

        if not os.path.exists(backup_file):
            return web.json_response({"error": "Backup file not found"}, status=404)

        shutil.copy2(backup_file, SETTINGS_FILE)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.delete("/rayko_settings_manager/delete/{backup_name}")
async def delete_backup(request):
    try:
        backup_name = request.match_info.get('backup_name')

        if not backup_name:
            return web.json_response({"error": "Backup name not specified"}, status=400)

        backup_path = os.path.join(BACKUP_DIR, backup_name)

        if not os.path.exists(backup_path):
            return web.json_response({"error": "Backup not found"}, status=404)

        shutil.rmtree(backup_path)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/rayko_settings_manager/restart")
async def restart_server(request):
    try:
        os.execv(sys.executable, [sys.executable] + sys.argv)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# -------------------- Workflow Presets --------------------

def _sanitize_name(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '_', (name or "").strip()).rstrip('. ')


@PromptServer.instance.routes.get("/rayko_settings_manager/presets/list")
async def list_presets(request):
    try:
        presets = []
        if os.path.exists(PRESETS_DIR):
            for f in sorted(os.listdir(PRESETS_DIR)):
                if not f.endswith(".json"):
                    continue
                try:
                    with open(os.path.join(PRESETS_DIR, f), "r", encoding="utf-8") as fp:
                        data = json.load(fp)
                    presets.append({
                        "name": f[:-5],
                        "count": len(data.get("workflows", [])),
                    })
                except Exception as e:
                    logger.warning(f"Failed to read preset {f}: {e}")
        return web.json_response({"success": True, "presets": presets})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/rayko_settings_manager/presets/get/{name}")
async def get_preset(request):
    try:
        name = _sanitize_name(request.match_info.get("name") or "")
        if not name:
            return web.json_response({"error": "Name required"}, status=400)
        path = os.path.join(PRESETS_DIR, f"{name}.json")
        if not os.path.exists(path):
            return web.json_response({"error": "Not found"}, status=404)
        with open(path, "r", encoding="utf-8") as f:
            return web.json_response(json.load(f))
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/rayko_settings_manager/presets/save")
async def save_preset(request):
    try:
        data = await request.json()
        name = _sanitize_name(data.get("name", ""))
        workflows = data.get("workflows", [])
        if not name:
            return web.json_response({"error": "Name required"}, status=400)
        if not workflows:
            return web.json_response({"error": "No workflows to save"}, status=400)

        payload = {
            "created": datetime.datetime.now().isoformat(timespec="seconds"),
            "workflows": workflows,
        }
        path = os.path.join(PRESETS_DIR, f"{name}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        return web.json_response({"success": True, "name": name, "count": len(workflows)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.delete("/rayko_settings_manager/presets/delete/{name}")
async def delete_preset(request):
    try:
        name = _sanitize_name(request.match_info.get("name") or "")
        if not name:
            return web.json_response({"error": "Name required"}, status=400)
        path = os.path.join(PRESETS_DIR, f"{name}.json")
        if not os.path.exists(path):
            return web.json_response({"error": "Not found"}, status=404)
        os.remove(path)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}