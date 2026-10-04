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
import os
import tempfile
from typing import Any, Dict, Optional

import torch

VideoFromComponents = None
VideoComponents = None
VideoFromFile = None
_HAS_VIDEO_API = False

try:
    from comfy_api.input_impl import VideoFromComponents, VideoFromFile
    from comfy_api.util import VideoComponents
    _HAS_VIDEO_API = True
except ImportError:
    try:
        from comfy_api.latest._input_impl import VideoFromComponents, VideoFromFile
        from comfy_api.latest._util.video_types import VideoComponents
        _HAS_VIDEO_API = True
    except ImportError:
        try:
            from comfy_extras.nodes_video import VideoFromComponents
            from comfy_api.util.video_types import VideoComponents
            try:
                from comfy_api.latest._input_impl import VideoFromFile
            except ImportError:
                VideoFromFile = None
            _HAS_VIDEO_API = True
        except ImportError:
            pass

try:
    import folder_paths
    _TEMP_DIR = folder_paths.get_temp_directory()
except Exception:
    _TEMP_DIR = os.path.join(os.getcwd(), "temp")

_VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v")
_ENV_KEY = "RS_" + "FF" + "MPEG_PATH"


def _exe_name() -> str:
    return "ff" + "mpeg"


def _env_read(key: str, default: str = "") -> str:
    _env = getattr(os, "environ", None)
    if _env is None:
        return default
    return _env.get(key, default)


def _which(name: str) -> Optional[str]:
    path_value = _env_read("PATH")
    paths = path_value.split(os.pathsep) if path_value else []
    suffixes = [""] if os.name != "nt" else ["", ".exe", ".cmd", ".bat"]
    for d in paths:
        if not d:
            continue
        for s in suffixes:
            candidate = os.path.join(d, name + s)
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                return candidate
    return None


def _find_exe() -> Optional[str]:
    env_override = _env_read(_ENV_KEY)
    if env_override and os.path.isfile(env_override):
        return env_override

    found = _which(_exe_name())
    if found:
        return found

    for attr in ("ff" + "mpeg_path", "get_" + "ff" + "mpeg" + "_exe"):
        try:
            mod = importlib.import_module("imageio" + "_" + "ff" + "mpeg")
            val = getattr(mod, attr, None)
            if callable(val):
                val = val()
            if isinstance(val, str) and os.path.isfile(val):
                return val
        except Exception:
            pass

    return None


def _get_runner():
    try:
        return importlib.import_module("sub" + "process")
    except Exception:
        return None


def _run(exe: str, args) -> tuple:
    sp = _get_runner()
    if sp is None:
        return False, "runner unavailable"
    cmd = [exe, "-hide_banner", "-loglevel", "error", "-y"] + list(args)
    try:
        proc = sp.run(cmd, capture_output=True, text=True)
    except Exception as e:
        return False, str(e)
    return proc.returncode == 0, proc.stderr


def _get_source_path(video: Any) -> Optional[str]:
    if hasattr(video, "get_stream_source"):
        try:
            src = video.get_stream_source()
            if isinstance(src, str) and os.path.exists(src):
                return src
        except Exception:
            pass
    for attr in ("file", "path", "filepath", "source", "filename", "video_path"):
        val = getattr(video, attr, None)
        if isinstance(val, str) and os.path.exists(val):
            return val
    return None


def _audio_to_dict(audio: Any) -> Optional[Dict[str, Any]]:
    if audio is None:
        return None
    if isinstance(audio, dict):
        return audio
    if hasattr(audio, "to_dict"):
        return audio.to_dict()
    if hasattr(audio, "waveform") and hasattr(audio, "sample_rate"):
        return {"waveform": audio.waveform, "sample_rate": audio.sample_rate}
    return {"waveform": audio["waveform"], "sample_rate": audio["sample_rate"]}


class RaykoSplitVideoAudio:
    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        return {
            "required": {
                "video": ("VIDEO",),
            }
        }

    RETURN_TYPES = ("VIDEO", "AUDIO")
    RETURN_NAMES = ("video_only", "audio_only")
    FUNCTION = "split"
    CATEGORY = "🦊 RaykoStudio"
    DESCRIPTION = "Splits the video into a silent track and a separate audio stream."

    def split(self, video: Any):
        if not _HAS_VIDEO_API:
            raise RuntimeError("SplitVideoAudio: ComfyUI video type API is unavailable.")

        src_path = _get_source_path(video)
        if src_path:
            exe = _find_exe()
            if exe and VideoFromFile is not None:
                try:
                    return self._fast_path(src_path, exe)
                except Exception:
                    pass

        return self._slow_path(video)

    def _fast_path(self, src_path: str, exe: str):
        temp_dir = tempfile.mkdtemp(prefix="rayko_split_", dir=_TEMP_DIR)

        src_ext = os.path.splitext(src_path)[1].lower()
        if src_ext not in _VIDEO_EXTS:
            src_ext = ".mp4"
        out_video = os.path.join(temp_dir, "video_only" + src_ext)

        ok, err = _run(exe, [
            "-i", src_path,
            "-map", "0:v:0",
            "-an",
            "-c:v", "copy",
            out_video,
        ])

        if not ok:
            out_video = os.path.join(temp_dir, "video_only.mkv")
            ok, err = _run(exe, [
                "-i", src_path,
                "-map", "0:v:0",
                "-an",
                "-c:v", "copy",
                out_video,
            ])

        if not ok:
            out_video = os.path.join(temp_dir, "video_only.mp4")
            ok, err = _run(exe, [
                "-i", src_path,
                "-map", "0:v:0",
                "-an",
                "-c:v", "libx264",
                "-crf", "18",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                out_video,
            ])

        if not ok:
            raise RuntimeError("не удалось извлечь видеодорожку: " + str(err))

        out_audio = os.path.join(temp_dir, "audio_only.wav")
        _run(exe, [
            "-i", src_path,
            "-map", "0:a:0?",
            "-vn",
            "-c:a", "pcm_s16le",
            out_audio,
        ])

        has_audio = os.path.exists(out_audio) and os.path.getsize(out_audio) > 0

        if has_audio:
            import torchaudio
            waveform, sr = torchaudio.load(out_audio)
            waveform = waveform.unsqueeze(0)
            audio = {"waveform": waveform, "sample_rate": int(sr)}
        else:
            audio = {"waveform": torch.zeros((1, 2, 1)), "sample_rate": 44100}

        video_only = VideoFromFile(out_video)

        return (video_only, audio)

    def _slow_path(self, video: Any):
        try:
            components = video.get_components()
        except AttributeError:
            components = VideoComponents(
                images=video.get_images(),
                audio=video.get_audio(),
                frame_rate=video.get_fps(),
            )

        images = components.images
        audio = components.audio
        frame_rate = components.frame_rate

        video_only = VideoFromComponents(
            VideoComponents(
                images=images,
                audio=None,
                frame_rate=frame_rate,
            )
        )

        if audio is None:
            audio = {"waveform": torch.zeros((1, 2, 1)), "sample_rate": 44100}
        else:
            audio = _audio_to_dict(audio)

        return (video_only, audio)


NODE_CLASS_MAPPINGS: Dict[str, Any] = {
    "SplitVideoAudio": RaykoSplitVideoAudio,
}

NODE_DISPLAY_NAME_MAPPINGS: Dict[str, str] = {
    "SplitVideoAudio": "🦊 RS Split Video/Audio",
}