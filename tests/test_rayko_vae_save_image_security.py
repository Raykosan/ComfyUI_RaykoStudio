# tests/test_rayko_vae_save_image_security.py
"""
Regression tests for the output-directory boundary in RS_VAE_Decode_Save.

The node intentionally supports user-configured output directories. To keep
that feature safe, every write is routed through `_resolve_target_dir()`,
which resolves the final path with `os.path.realpath()` and verifies it lies
inside one of the roots returned by `_get_allowed_roots()`.

These tests exercise the boundary directly, without invoking VAE decode or
image saving.
"""

import os
import sys
import types
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Import-time stubs
#
# ComfyUI's pytest.ini is picked up from the installation root, which means
# ComfyUI's own conftest may try to load the plugin before our test module is
# imported. We install stubs for the runtime-only ComfyUI modules at *module
# import time* so that any plugin import during collection also sees them.
#
# Only modules that are unavailable outside a live ComfyUI process are stubbed:
#   - folder_paths  (needs ComfyUI's paths machinery)
#   - server        (needs a running PromptServer instance)
#   - aiohttp.web   (its json_response is only used inside the route handler)
#
# torch, numpy and PIL are real, so we do NOT stub them.
# ---------------------------------------------------------------------------


def _fresh_module(name: str) -> types.ModuleType:
    """Install a blank module under *name*, removing any earlier version."""
    for existing in list(sys.modules):
        if existing == name or existing.startswith(name + "."):
            sys.modules.pop(existing, None)
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    return mod


def _install_import_stubs(output_dir: Path, temp_dir: Path) -> None:
    # ---- folder_paths -----------------------------------------------------
    fp = _fresh_module("folder_paths")
    fp.get_output_directory = lambda: str(output_dir)
    fp.get_temp_directory = lambda: str(temp_dir)
    fp.get_save_image_path = lambda *a, **k: (str(output_dir), "img", 1, "", "")

    # ---- server.PromptServer ---------------------------------------------
    # `from server import PromptServer` must yield a *class* with an
    # `instance` attribute that exposes `.routes.get(...)` as a decorator.
    server_mod = _fresh_module("server")

    class _Routes:
        def get(self, *args, **kwargs):
            def decorator(fn):
                return fn
            return decorator

    class PromptServer:  # noqa: N801 - matches ComfyUI's class name
        instance = types.SimpleNamespace(routes=_Routes())

    server_mod.PromptServer = PromptServer

    # ---- aiohttp.web ------------------------------------------------------
    aiohttp_mod = _fresh_module("aiohttp")
    aiohttp_web = types.ModuleType("aiohttp.web")
    aiohttp_web.json_response = lambda *a, **k: None
    aiohttp_mod.web = aiohttp_web
    sys.modules["aiohttp.web"] = aiohttp_web


@pytest.fixture
def node_class(tmp_path, monkeypatch):
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    _install_import_stubs(output_dir, temp_dir)

    # Make sure we get a clean import of the node module.
    sys.modules.pop("Rayko_VAE_Save_Image", None)

    repo_root = Path(__file__).resolve().parent.parent
    monkeypatch.syspath_prepend(str(repo_root))

    import Rayko_VAE_Save_Image as mod  # noqa: E402

    return mod.RS_VAE_Decode_Save, output_dir


# ---------------------------------------------------------------------------
# Sanitizer (convenience, not a security boundary)
# ---------------------------------------------------------------------------

class TestSanitizePathComponent:
    def test_strips_dotdot(self, node_class):
        cls, _ = node_class
        assert ".." not in cls._sanitize_path_component("../../etc/passwd")

    def test_strips_illegal_chars(self, node_class):
        cls, _ = node_class
        out = cls._sanitize_path_component('a<b>c:d"e|f?g*h')
        assert not any(c in out for c in '<>:"|?*')

    def test_backslashes_become_slashes(self, node_class):
        cls, _ = node_class
        assert "\\" not in cls._sanitize_path_component(r"a\b\c")


# ---------------------------------------------------------------------------
# Containment primitive
# ---------------------------------------------------------------------------

class TestIsWithin:
    def test_path_inside_root(self, tmp_path, node_class):
        cls, _ = node_class
        root = str(tmp_path / "root")
        os.makedirs(root, exist_ok=True)
        inside = os.path.join(root, "sub", "file.txt")
        assert cls._is_within(inside, [root]) is True

    def test_path_outside_root(self, tmp_path, node_class):
        cls, _ = node_class
        root = str(tmp_path / "root")
        outside = str(tmp_path / "other")
        os.makedirs(root, exist_ok=True)
        os.makedirs(outside, exist_ok=True)
        assert cls._is_within(outside, [root]) is False

    def test_prefix_collision_is_not_containment(self, tmp_path, node_class):
        # "/out" must not be treated as a parent of "/out-evil"
        cls, _ = node_class
        root = str(tmp_path / "out")
        sibling = str(tmp_path / "out-evil")
        os.makedirs(root, exist_ok=True)
        os.makedirs(sibling, exist_ok=True)
        assert cls._is_within(sibling, [root]) is False


# ---------------------------------------------------------------------------
# Boundary enforcement
# ---------------------------------------------------------------------------

class TestResolveTargetDir:
    def test_empty_path_returns_output_dir(self, node_class):
        cls, output_dir = node_class
        node = cls()
        assert os.path.realpath(node._resolve_target_dir("")) == os.path.realpath(
            str(output_dir)
        )

    def test_relative_subfolder_inside_output(self, node_class):
        cls, output_dir = node_class
        node = cls()
        resolved = node._resolve_target_dir("project_v2")
        assert resolved == os.path.realpath(
            os.path.join(str(output_dir), "project_v2")
        )

    def test_traversal_stays_inside_output(self, node_class):
        # After sanitization this must resolve under output_dir, never above it.
        cls, output_dir = node_class
        node = cls()
        resolved = node._resolve_target_dir("../../etc/passwd")
        assert resolved.startswith(os.path.realpath(str(output_dir)))

    def test_absolute_path_outside_roots_is_rejected(self, tmp_path, node_class):
        cls, _ = node_class
        node = cls()
        outside = str(tmp_path / "outside")
        os.makedirs(outside, exist_ok=True)
        with pytest.raises(PermissionError):
            node._resolve_target_dir(outside)

    def test_absolute_path_inside_extra_root_is_allowed(
        self, tmp_path, monkeypatch, node_class
    ):
        cls, _ = node_class
        extra = tmp_path / "extra"
        extra.mkdir()
        monkeypatch.setenv("RS_EXTRA_OUTPUT_ROOTS", str(extra))
        node = cls()
        resolved = node._resolve_target_dir(str(extra))
        assert resolved == os.path.realpath(str(extra))

    def test_multiple_extra_roots(self, tmp_path, monkeypatch, node_class):
        cls, _ = node_class
        a = tmp_path / "a"
        b = tmp_path / "b"
        a.mkdir()
        b.mkdir()
        monkeypatch.setenv("RS_EXTRA_OUTPUT_ROOTS", f"{a}{os.pathsep}{b}")
        node = cls()
        assert node._resolve_target_dir(str(a)) == os.path.realpath(str(a))
        assert node._resolve_target_dir(str(b)) == os.path.realpath(str(b))

    def test_symlink_escape_is_rejected(self, tmp_path, node_class):
        cls, output_dir = node_class
        node = cls()
        outside = tmp_path / "outside"
        outside.mkdir()
        link = output_dir / "escape"
        try:
            os.symlink(str(outside), str(link), target_is_directory=True)
        except (OSError, NotImplementedError):
            pytest.skip("symlinks not supported on this platform")
        with pytest.raises(PermissionError):
            node._resolve_target_dir("escape")

    def test_windows_drive_outside_is_rejected(self, node_class):
        if os.name != "nt":
            pytest.skip("Windows-only case")
        cls, _ = node_class
        node = cls()
        with pytest.raises(PermissionError):
            node._resolve_target_dir("Z:/definitely-not-allowed")


# ---------------------------------------------------------------------------
# Allowlist composition
# ---------------------------------------------------------------------------

class TestAllowedRoots:
    def test_output_dir_always_allowed(self, node_class):
        cls, output_dir = node_class
        node = cls()
        assert os.path.realpath(str(output_dir)) in node._get_allowed_roots()

    def test_env_var_adds_root(self, tmp_path, monkeypatch, node_class):
        cls, _ = node_class
        extra = tmp_path / "extra"
        extra.mkdir()
        monkeypatch.setenv("RS_EXTRA_OUTPUT_ROOTS", str(extra))
        node = cls()
        assert os.path.realpath(str(extra)) in node._get_allowed_roots()

    def test_env_var_empty_is_ignored(self, monkeypatch, node_class):
        cls, _ = node_class
        monkeypatch.setenv("RS_EXTRA_OUTPUT_ROOTS", "")
        node = cls()
        # Only the output dir should be present.
        assert len(node._get_allowed_roots()) == 1