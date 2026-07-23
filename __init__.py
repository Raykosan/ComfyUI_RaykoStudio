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

import importlib
import logging
from pathlib import Path
from typing import Dict, Any, Set
import sys

logger = logging.getLogger(__name__)

NODE_CLASS_MAPPINGS: Dict[str, Any] = {}
NODE_DISPLAY_NAME_MAPPINGS: Dict[str, str] = {}

IGNORED_MODULES: Set[str] = {'__init__.py'}

REQUIRED_MODULES: Set[str] = set()

PACKAGE_DISPLAY_NAME = "ComfyUI_RaykoStudio"
__version__ = "0.31.1"

def load_modules():
    print(f"🦊 {PACKAGE_DISPLAY_NAME}: Version: {__version__}")
    
    try:
        current_dir = Path(__file__).parent
        logger.debug(f"Scanning the directory: {current_dir}")
        
        loaded_modules = []
        failed_modules = []
        for py_file in current_dir.glob('*.py'):
            filename = py_file.name
            if filename in IGNORED_MODULES:
                logger.debug(f"Skipping the ignored file: {filename}")
                continue
            
            module_name = py_file.stem
            logger.debug(f"Module loading attempt: {module_name}")
            
            try:
                module = importlib.import_module(f'.{module_name}', package=__name__)
                _merge_module_mappings(module, module_name)
                loaded_modules.append(module_name)
            except ImportError as e:
                failed_modules.append((module_name, str(e)))
                logger.error(f"Module import error {module_name}: {e}")
            except Exception as e:
                failed_modules.append((module_name, str(e)))
                logger.error(f"Unexpected error in the module {module_name}: {e}")

        missing_required = REQUIRED_MODULES - set(loaded_modules)
        if missing_required:
            logger.error(f"Required modules are not loaded: {missing_required}")

        if not failed_modules:
            logger.info(f"🦊 {PACKAGE_DISPLAY_NAME}: All modules \033[92mLOADED SUCCESSFULLY\033[0m")
        else:
            for mod_name, error in failed_modules:
                logger.error(f"The module '{mod_name}' is not loaded: {error}")
            logger.warning(f"Loaded {len(loaded_modules)} modules, errors in {len(failed_modules)} modules")

    except Exception as e:
        logger.critical(f"Critical error when loading modules: {e}")
        raise

def _merge_module_mappings(module, module_name: str):
    try:
        if hasattr(module, 'NODE_CLASS_MAPPINGS'):
            new_classes = module.NODE_CLASS_MAPPINGS
            duplicates = set(NODE_CLASS_MAPPINGS.keys()) & set(new_classes.keys())
            if duplicates:
                logger.warning(f"Duplicate classes found in the module {module_name}: {duplicates}")
            NODE_CLASS_MAPPINGS.update(new_classes)
            logger.debug(f"Added classes from: {list(new_classes.keys())}")
        
        if hasattr(module, 'NODE_DISPLAY_NAME_MAPPINGS'):
            new_names = module.NODE_DISPLAY_NAME_MAPPINGS
            duplicates = set(NODE_DISPLAY_NAME_MAPPINGS.keys()) & set(new_names.keys())
            if duplicates:
                logger.warning(f"Duplicate names found in the module {module_name}: {duplicates}")
            NODE_DISPLAY_NAME_MAPPINGS.update(new_names)
            logger.debug(f"Added names from {module_name}: {list(new_names.keys())}")
            
    except Exception as e:
        logger.error(f"Error when combining mappings from the module {module_name}: {e}")
        raise

try:
    load_modules()
except Exception as e:
    logger.critical(f"Fatal error during package initialization: {e}")
    pass

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']

if not NODE_CLASS_MAPPINGS:
    logger.warning("NODE_CLASS_MAPPINGS is empty - perhaps no modules with nodes were found")
else:
    logger.debug(f"Uploaded by {len(NODE_CLASS_MAPPINGS)} node classes")

if not NODE_DISPLAY_NAME_MAPPINGS:
    logger.debug("NODE_DISPLAY_NAME_MAPPINGS is empty - the default class names will be used")
else:
    logger.debug(f"Loaded {len(NODE_DISPLAY_NAME_MAPPINGS)} display names")

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']