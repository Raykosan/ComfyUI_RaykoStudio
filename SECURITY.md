# Security Policy

This document describes the security posture, network activity, and file handling of the **ComfyUI-RaykoStudio** custom node pack. We aim for transparency so that users and automated scanners can verify that there is no malicious behavior.

## What the Pack Does

`ComfyUI-RaykoStudio` provides custom nodes for ComfyUI, including:

- A LoRA loader that fetches metadata from Civitai using a SHA256 hash.
- Image saving with restricted output paths.
- Color adjustment and other utility nodes.
- WebSocket communication with the ComfyUI frontend for UI updates.

The pack does **not** collect telemetry, send user data to third-party servers (except for explicit Civitai API requests for LoRA metadata), or execute externally supplied code.

## Network Operations

### Civitai API Requests

In `Rayko_LoRA_Loader.py` and `rayko_api.py`, the `aiohttp` library is used to perform a GET request to:

    https://civitai.com/api/v1/model-versions/by-hash/{sha256}

- **Purpose:** Retrieve model information (name, description, trained words) based on the LoRA file hash.
- **Data sent:** Only the SHA256 hash of the LoRA file. No user data, paths, or file contents are transmitted.
- **Direction:** Outbound only. The response is used to populate a local metadata database.
- **User-Agent:** `ComfyUI-RaykoStudio/1.0` — for client identification.

If you do not want the pack to contact Civitai, avoid using the metadata-related nodes or block `civitai.com` at the network level.

### WebSocket in the Frontend

In `web/rs_adjustments.js` and other JS files, the internal WebSocket handle is used to send messages from the UI to the ComfyUI server. This is the standard mechanism for custom nodes to communicate with the backend, not a hidden data exfiltration channel.

## File Operations

- **Reading:** The pack reads LoRA files and associated metadata from directories configured in ComfyUI.
- **Writing:**
  - Maintains a local JSON database of LoRA metadata.
  - Saves images via the `Rayko_VAE_Save_Image` node to allowed directories.
- **Path restriction:** `Rayko_VAE_Save_Image.py` implements an allowlist of root directories. The primary path is ComfyUI's `output_dir`. Additional roots can be set via the `RS_EXTRA_OUTPUT_ROOTS` environment variable.

## Environment Variables

### `RS_EXTRA_OUTPUT_ROOTS`

- **Purpose:** Allows an administrator to specify additional allowed directories for image saving.
- **Format:** A list of paths separated by `os.pathsep` (`:` on Linux/macOS, `;` on Windows).
- **Security:** The variable is only read to extend the path allowlist. If not set, only the standard ComfyUI output paths are used.

## JavaScript Code

The frontend uses standard patterns:

- Method binding via the built-in `bind` function — context binding in classes and event handlers.
- WebSocket `send` calls — sending messages over WebSocket.

These constructs are not a threat and are common in any ComfyUI frontend code.

## Dynamic Imports

Prior to version `0.48.2`, the code contained a dynamic import of the `datetime` module using the built-in import function. In version `0.48.2`, it was replaced with the standard `from datetime import datetime` form. This eliminates the false positive `$import_func_direct` from security scanners. There are no other dynamic imports in the pack.

## Absence of Dangerous Functions

The pack **does not** contain:

- Dynamic code evaluation or execution.
- Shell or subprocess invocation.
- Code obfuscation.
- Hidden telemetry or data sent to unknown servers.
- Automatic download and execution of third-party code.

## Compatibility and Supported Versions

Current version: `0.48.4` and later.  
Always use the latest version to benefit from security fixes and improvements.

## Reporting a Vulnerability

If you discover a potential security issue, please open an issue on GitHub or contact the author directly. We aim to respond within 48 hours.

When reporting, please include:

- Pack version
- File and line number
- Description of the issue and potential impact
- Steps to reproduce (if applicable)

## Recommendations for Users

- Run ComfyUI in an isolated environment (container, venv).
- Restrict filesystem access where possible.
- Review custom node code before installation.
- Do not set `RS_EXTRA_OUTPUT_ROOTS` to directories containing sensitive data.
- Keep the pack updated.

## Why a Scanner May Report `Flagged`

Automated security scanners (e.g., in ComfyUI-Manager) may flag the pack due to:

- Use of the `aiohttp` HTTP client library (network operations).
- Presence of WebSocket `send` calls in JS.
- Use of the `bind` function in JS.
- Reading environment variables via `os.environ`.

All of these are legitimate for this pack and are explained above. If a scanner still flags it, you may reference this document for clarification.

---

*Last updated: 2026-09-28*
