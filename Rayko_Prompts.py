import json
import os
import server
import torch
from aiohttp import web
from concurrent.futures import Future
import time

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROMPTS_DIR = os.path.join(CURRENT_DIR, "prompts")

if not os.path.exists(PROMPTS_DIR):
    os.makedirs(PROMPTS_DIR)

PENDING_PROMPTS = {}

class RSPrompts:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "text": ("STRING", {"multiline": True, "default": "", "hidden": True}),
            },
            "optional": {
                "text_input": ("STRING", {"forceInput": True}),
                "disable_text_input": ("BOOLEAN", {"default": False, "label": "🔘 Disable text input"}),
                "pause_for_edit": ("BOOLEAN", {"default": False, "label": "⏸️ Pause for manual edit"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "STRING")
    RETURN_NAMES = ("POSITIVE", "NEGATIVE", "PROMPT_STRING")
    FUNCTION = "encode_prompts"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Text encoder with visual prompt controls and pause-for-edit mode."

    def encode_prompts(self, clip, disable_text_input=False, pause_for_edit=False, text="", text_input=None, unique_id=None):
        if disable_text_input:
            current_text = text
            effective_text_input = None
        else:
            current_text = text_input if text_input is not None else text
            effective_text_input = text_input
        
        if effective_text_input is not None and not pause_for_edit and unique_id:
            from server import PromptServer
            PromptServer.instance.send_sync("rs.prompt.update", {
                "node_id": unique_id,
                "prompt": current_text
            })
        
        if pause_for_edit and effective_text_input is not None and effective_text_input and unique_id:
            print(f"[RS Prompts 🦊] Pause mode enabled for node {unique_id}")
            
            PENDING_PROMPTS[unique_id] = {
                "original": current_text,
                "edited": current_text,
                "status": "pending",
                "timestamp": time.time(),
                "clip": clip
            }
            
            from server import PromptServer
            PromptServer.instance.send_sync("rs.prompt.pause", {
                "node_id": unique_id,
                "prompt": current_text
            })
            
            future = Future()
            PENDING_PROMPTS[unique_id]["future"] = future
            
            try:
                result = future.result(timeout=600)
                if result["status"] == "approved":
                    final_text = result["prompt"]
                    print(f"[RS Prompts 🦊] Using edited prompt: {final_text[:50]}...")
                else:
                    final_text = current_text
                    print(f"[RS Prompts 🦊] Using original prompt")
            except TimeoutError:
                print(f"[RS Prompts 🦊] Timeout! Using original prompt")
                final_text = current_text
            except Exception as e:
                print(f"[RS Prompts 🦊] Error: {e}, using original")
                final_text = current_text
            finally:
                if unique_id in PENDING_PROMPTS:
                    del PENDING_PROMPTS[unique_id]
            
            current_text = final_text
        
        tokens_pos = clip.tokenize(current_text)
        pos_cond = clip.encode_from_tokens_scheduled(tokens_pos)
        
        tokens_neg = clip.tokenize("")
        neg_cond = clip.encode_from_tokens_scheduled(tokens_neg)

        return {
            "ui": {"text": [current_text]},
            "result": (pos_cond, neg_cond, current_text)
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


@server.PromptServer.instance.routes.post("/rs_prompts/save_prompt")
async def rs_prompts_save_prompt(request):
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        if not name: 
            return web.Response(status=400, text="Name required")
        name = "".join(c for c in name if c.isalnum() or c in " _-").strip()
        if not name: 
            return web.Response(status=400, text="Invalid name")
        filepath = os.path.join(PROMPTS_DIR, f"{name}.json")
        prompt_data = {"text": data.get("text", "")}
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(prompt_data, f, indent=2)
        return web.Response(status=200, text="OK")
    except Exception as e:
        return web.Response(status=500, text=str(e))

@server.PromptServer.instance.routes.post("/rs_prompts/list_prompts")
async def rs_prompts_list_prompts(request):
    try:
        prompts = []
        if os.path.exists(PROMPTS_DIR):
            prompts = [f[:-5] for f in os.listdir(PROMPTS_DIR) if f.endswith('.json')]
        return web.json_response(prompts)
    except Exception as e:
        return web.Response(status=500, text=str(e))

@server.PromptServer.instance.routes.post("/rs_prompts/load_prompt")
async def rs_prompts_load_prompt(request):
    try:
        data = await request.json()
        name = data.get("name")
        filepath = os.path.join(PROMPTS_DIR, f"{name}.json")
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return web.json_response(json.load(f))
        return web.Response(status=404, text="Prompt not found")
    except Exception as e:
        return web.Response(status=500, text=str(e))

@server.PromptServer.instance.routes.post("/rs_prompts/delete_prompt")
async def rs_prompts_delete_prompt(request):
    try:
        data = await request.json()
        name = data.get("name")
        if not name: 
            return web.Response(status=400, text="Name required")
        filepath = os.path.join(PROMPTS_DIR, f"{name}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            return web.Response(status=200, text="OK")
        return web.Response(status=404, text="Prompt not found")
    except Exception as e:
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/rs_prompts/approve_edit")
async def rs_prompts_approve_edit(request):
    try:
        data = await request.json()
        node_id = data.get("node_id")
        edited_prompt = data.get("prompt", "")
        
        if node_id in PENDING_PROMPTS:
            pending = PENDING_PROMPTS[node_id]
            pending["status"] = "approved"
            pending["edited"] = edited_prompt
            
            if "future" in pending:
                pending["future"].set_result({
                    "status": "approved",
                    "prompt": edited_prompt
                })
            
            print(f"[RS Prompts 🦊] Node {node_id} approved with new prompt")
            return web.Response(status=200, text="Approved")
        else:
            return web.Response(status=404, text=f"Node {node_id} not waiting")
            
    except Exception as e:
        print(f"[RS Prompts 🦊] Error in approve_edit: {e}")
        return web.Response(status=500, text=str(e))


@server.PromptServer.instance.routes.post("/rs_prompts/reject_edit")
async def rs_prompts_reject_edit(request):
    try:
        data = await request.json()
        node_id = data.get("node_id")
        
        if node_id in PENDING_PROMPTS:
            pending = PENDING_PROMPTS[node_id]
            pending["status"] = "rejected"
            
            if "future" in pending:
                pending["future"].set_result({
                    "status": "rejected",
                    "prompt": pending["original"]
                })
            
            print(f"[RS Prompts 🦊] Node {node_id} rejected, using original")
            return web.Response(status=200, text="Rejected")
        else:
            return web.Response(status=404, text=f"Node {node_id} not waiting")
            
    except Exception as e:
        print(f"[RS Prompts 🦊] Error in reject_edit: {e}")
        return web.Response(status=500, text=str(e))


NODE_CLASS_MAPPINGS = {"RSPrompts": RSPrompts}
NODE_DISPLAY_NAME_MAPPINGS = {"RSPrompts": "🦊 RS Prompts"}