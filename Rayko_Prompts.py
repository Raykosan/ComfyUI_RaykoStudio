import json
import os
import server
import torch
from aiohttp import web

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROMPTS_DIR = os.path.join(CURRENT_DIR, "prompts")

if not os.path.exists(PROMPTS_DIR):
    os.makedirs(PROMPTS_DIR)

class RSPrompts:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {"tooltip": "CLIP model to encode prompts with."}),
                "Positive prompt": ("STRING", {"default": "", "multiline": True}),
                "Negative prompt": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("POSITIVE", "NEGATIVE")
    FUNCTION = "encode_prompts"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Combined positive and negative prompt encoder with preset management."

    def encode_prompts(self, clip, **kwargs):
        positive = kwargs.get("Positive prompt", "")
        negative = kwargs.get("Negative prompt", "")

        tokens_pos = clip.tokenize(positive)
        pos_cond = clip.encode_from_tokens_scheduled(tokens_pos)
        
        tokens_neg = clip.tokenize(negative)
        neg_cond = clip.encode_from_tokens_scheduled(tokens_neg)

        return (pos_cond, neg_cond)

NODE_CLASS_MAPPINGS = {"RSPrompts": RSPrompts}
NODE_DISPLAY_NAME_MAPPINGS = {"RSPrompts": "🦊 RS Prompts"}

@server.PromptServer.instance.routes.post("/rs_prompts/save_prompt")
async def rs_prompts_save_prompt(request):
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        if not name: return web.Response(status=400, text="Name required")
        name = "".join(c for c in name if c.isalnum() or c in " _-").strip()
        if not name: return web.Response(status=400, text="Invalid name")
        
        filepath = os.path.join(PROMPTS_DIR, f"{name}.json")
        prompt_data = {
            "positive": data.get("positive", ""),
            "negative": data.get("negative", "")
        }
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
        if not name: return web.Response(status=400, text="Name required")
        filepath = os.path.join(PROMPTS_DIR, f"{name}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            return web.Response(status=200, text="OK")
        return web.Response(status=404, text="Prompt not found")
    except Exception as e:
        return web.Response(status=500, text=str(e))