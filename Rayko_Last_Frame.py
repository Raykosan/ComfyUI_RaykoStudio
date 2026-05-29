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

import torch

class RS_Last_Frame:
    SIZE = (200, 40)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video_frames": ("*",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "get_last_frame"
    CATEGORY = "🦊 RaykoStudio"

    def get_last_frame(self, video_frames):
        frames = None

        if isinstance(video_frames, torch.Tensor):
            frames = video_frames
            print(f"[RS_Last_Frame] ✅ Received ready IMAGE tensor: {frames.shape}")

        elif hasattr(video_frames, 'get_components'):
            try:
                comp = video_frames.get_components()
                print(f"[RS_Last_Frame] 🔍 get_components returned type: {type(comp)}")

                if isinstance(comp, (tuple, list)) and len(comp) > 0:
                    frames = comp[0]
                    print(f"[RS_Last_Frame] 📦 Extracted from tuple[0]: {type(frames)}")

                elif isinstance(comp, dict):
                    frames = comp.get('video') or comp.get('frames') or comp.get('images')
                    print(f"[RS_Last_Frame] 📦 Extracted from dict: {type(frames)}")

                elif hasattr(comp, 'video'):
                    frames = comp.video
                elif hasattr(comp, 'frames'):
                    frames = comp.frames
                elif hasattr(comp, 'images'):
                    frames = comp.images
                elif hasattr(comp, 'data'):
                    frames = comp.data
                else:
                    frames = comp
                    print(f"[RS_Last_Frame] 📦 Direct assignment: {type(frames)}")

                if frames is not None:
                    print(f"[RS_Last_Frame] ✅ Successfully extracted frames: {type(frames)}, shape={getattr(frames, 'shape', 'N/A')}")

            except Exception as e:
                print(f"[RS_Last_Frame] ❌ get_components error: {e}")
                frames = None

        elif isinstance(video_frames, dict):
            frames = video_frames.get('frames') or video_frames.get('images') or video_frames.get('video')
            print(f"[RS_Last_Frame] 📦 Processed input dictionary")

        if frames is None:
            raise ValueError(
                f"❌ Failed to extract frames.\n"
                f"Input type: {type(video_frames)}\n"
                f"Available methods: {[m for m in dir(video_frames) if not m.startswith('_')]}"
            )

        if not isinstance(frames, torch.Tensor):
            raise ValueError(f"Expected torch.Tensor, got {type(frames)}")

        if frames.dim() == 5:
            frames = frames[0]
        elif frames.dim() == 4 and frames.shape[1] <= 4:
            frames = frames.permute(0, 2, 3, 1)
        elif frames.dim() != 4:
            raise ValueError(f"Unsupported tensor dimension: {frames.shape}")

        last_frame = frames[-1].unsqueeze(0)
        print(f"[RS_Last_Frame] 🖼️ Returned last frame: {last_frame.shape}")
        return (last_frame,)

NODE_CLASS_MAPPINGS = {
    "RS_Last_Frame": RS_Last_Frame
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RS_Last_Frame": "🦊 RS Last Frame"
}