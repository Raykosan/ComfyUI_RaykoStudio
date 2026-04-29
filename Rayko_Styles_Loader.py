import os
import re
import logging
import json
from typing import Dict, List, Tuple, Optional, Any
import folder_paths

logger = logging.getLogger(__name__)

class RaykoStylesCSVLoader:
    STYLES_FOLDER = "styles"
    
    @classmethod
    def get_node_dir(cls) -> str:
        return os.path.dirname(os.path.abspath(__file__))
    
    @classmethod
    def get_styles_folder_path(cls) -> str:
        return os.path.join(cls.get_node_dir(), cls.STYLES_FOLDER)
    
    @classmethod
    def get_available_style_files(cls) -> List[str]:
        styles_folder = cls.get_styles_folder_path()
        
        if not os.path.exists(styles_folder):
            os.makedirs(styles_folder, exist_ok=True)
            return []
        
        files = [
            f for f in os.listdir(styles_folder)
            if os.path.isfile(os.path.join(styles_folder, f))
            and f.lower().endswith('.csv')
        ]
        
        return sorted(files)
    
    @classmethod
    def load_styles_csv(cls, styles_path: str) -> Dict[str, List[str]]:
        styles = {}
        if not os.path.exists(styles_path):
            logger.error(f"Style file not found: {styles_path}")
            return {}
        
        try:
            with open(styles_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
                if not lines:
                    logger.warning(f"Empty file: {styles_path}")
                    return {}
                
                for i, line in enumerate(lines[1:], 1):
                    line = line.strip()
                    if not line:
                        continue
                    
                    parts = [
                        part.strip().strip('"') for part in re.split(
                            ',(?=(?:[^"]*"[^"]*")*[^"]*$)', line
                        )
                    ]
                    
                    if len(parts) >= 3:
                        style_name = parts[0].strip()
                        positive_prompt = parts[1].strip()
                        negative_prompt = parts[2].strip()
                        styles[style_name] = [positive_prompt, negative_prompt]
                    else:
                        logger.warning(f"Invalid format in line {i}: {line}")
            
            return styles
        except Exception as e:
            logger.error(f"Error loading styles from {styles_path}: {str(e)}")
            return {}
    
    @classmethod
    def get_style_prompts(cls, style_file: str, style_name: str) -> Tuple[str, str]:
        if not style_file or not style_name:
            return ("", "")
        
        safe_filename = os.path.basename(style_file.strip())
        
        styles_folder = cls.get_styles_folder_path()
        file_path = os.path.join(styles_folder, safe_filename)
        
        if not os.path.realpath(file_path).startswith(os.path.realpath(styles_folder) + os.sep):
            logger.error(f"Path traversal attempt blocked: {style_file}")
            return ("", "")
            
        styles = cls.load_styles_csv(file_path)
        
        if style_name in styles:
            return (styles[style_name][0], styles[style_name][1])
        
        style_name_clean = style_name.strip()
        for key in styles:
            if key.strip() == style_name_clean:
                return (styles[key][0], styles[key][1])
        
        return ("", "")
    
    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        return {
            "required": {
                "node_data": ("STRING", {
                    "default": "{}",
                    "hidden": True
                }),
            }
        }
    
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive prompt", "negative prompt")
    FUNCTION = "load_style"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Loads and combines styles from CSV files for prompt generation."
    
    @classmethod
    def IS_CHANGED(cls, node_data="{}", **kwargs):
        import hashlib
        if isinstance(node_data, str):
            return hashlib.md5(node_data.encode()).hexdigest()
        return hashlib.md5(json.dumps(node_data, sort_keys=True).encode()).hexdigest()
    
    def load_style(self, node_data: str = "{}") -> Tuple[str, str]:
        try:
            data = json.loads(node_data) if node_data else {}
            styles_list = data.get("styles", [])
            
            if not styles_list:
                return ("", "")
            
            all_positive = []
            all_negative = []
            
            for style in styles_list:
                name = style.get("name", "")
                file = style.get("file", "")
                enabled = style.get("enabled", True)
                
                if name and enabled:
                    pos, neg = self.get_style_prompts(file, name)
                    if pos:
                        all_positive.append(pos)
                    if neg:
                        all_negative.append(neg)
            
            final_positive = "\n".join(all_positive) if all_positive else ""
            final_negative = "\n".join(all_negative) if all_negative else ""
            
            return (final_positive, final_negative)
            
        except Exception as e:
            error_msg = f"Error loading styles: {str(e)}"
            logger.error(error_msg)
            return (error_msg, "")


class RaykoServer:
    @classmethod
    def _sanitize_filename(cls, filename: str, allowed_folder: str) -> Optional[str]:
        if not filename:
            return None
        
        safe_name = os.path.basename(filename.strip())
        
        if not safe_name or not safe_name.lower().endswith('.csv'):
            return None
        
        target_path = os.path.join(allowed_folder, safe_name)
        real_target = os.path.realpath(target_path)
        real_base = os.path.realpath(allowed_folder)
        
        if not real_target.startswith(real_base + os.sep) and real_target != real_base:
            logger.warning(f"Path traversal attempt blocked: {filename} -> {real_target}")
            return None
        
        return safe_name

    @classmethod
    def setup_routes(cls):
        try:
            from aiohttp import web
            import server
            
            @server.PromptServer.instance.routes.get("/rayko_get_csv_files")
            async def get_csv_files(request):
                try:
                    files = RaykoStylesCSVLoader.get_available_style_files()
                    return web.json_response(files)
                except Exception as e:
                    logger.error(f"Error getting CSV files: {e}")
                    return web.json_response({"error": str(e)}, status=500)
            
            @server.PromptServer.instance.routes.post("/rayko_upload_csv_file")
            async def upload_csv_file(request):
                try:
                    reader = await request.multipart()
                    field = await reader.next()
                    
                    if not field or field.name != 'file':
                        return web.json_response({'error': 'No file provided'}, status=400)
                    
                    original_filename = field.filename
                    styles_folder = RaykoStylesCSVLoader.get_styles_folder_path()
                    os.makedirs(styles_folder, exist_ok=True)
                    
                    safe_filename = cls._sanitize_filename(original_filename, styles_folder)
                    if not safe_filename:
                        return web.json_response({'error': 'Invalid or unsafe filename'}, status=400)
                    
                    file_path = os.path.join(styles_folder, safe_filename)
                    
                    try:
                        with open(file_path, 'wb') as f:
                            while True:
                                chunk = await field.read_chunk()
                                if not chunk:
                                    break
                                f.write(chunk)
                    except Exception as write_err:
                        logger.error(f"Error writing file: {write_err}")
                        if os.path.exists(file_path):
                            os.remove(file_path)
                        return web.json_response({'error': 'Failed to save file'}, status=500)
                    
                    return web.json_response({
                        'success': True,
                        'filename': safe_filename
                    })
                except Exception as e:
                    logger.error(f"Error uploading file: {e}")
                    return web.json_response({'error': str(e)}, status=500)
            
            @server.PromptServer.instance.routes.post("/rayko_get_styles_from_file")
            async def get_styles_from_file(request):
                try:
                    data = await request.json()
                    filename = data.get('filename')
                    if not filename:
                        return web.json_response({'error': 'No filename provided'}, status=400)
                    
                    safe_filename = cls._sanitize_filename(filename, RaykoStylesCSVLoader.get_styles_folder_path())
                    if not safe_filename:
                        return web.json_response({'error': 'Invalid filename'}, status=400)
                    
                    styles_folder = RaykoStylesCSVLoader.get_styles_folder_path()
                    file_path = os.path.join(styles_folder, safe_filename)
                    styles = RaykoStylesCSVLoader.load_styles_csv(file_path)
                    
                    return web.json_response({'styles': list(styles.keys())})
                except Exception as e:
                    logger.error(f"Error loading styles: {e}")
                    return web.json_response({'error': str(e)}, status=500)
        except Exception as e:
            logger.error(f"Failed to register server routes: {e}")

try:
    styles_folder = RaykoStylesCSVLoader.get_styles_folder_path()
    os.makedirs(styles_folder, exist_ok=True)
except Exception as e:
    logger.error(f"Failed to create styles folder: {e}")

try:
    RaykoServer.setup_routes()
except Exception as e:
    logger.error(f"Failed to setup server routes: {e}")

NODE_CLASS_MAPPINGS = {
    "Rayko_Styles_CSV_Loader": RaykoStylesCSVLoader
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Rayko_Styles_CSV_Loader": "🦊 RS Styles Loader"
}