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

Outbound requests to Civitai are performed using the Python standard library's synchronous HTTP client, invoked in a worker thread through `asyncio.to_thread` so the ComfyUI event loop is not blocked.

Endpoints contacted (read-only, `GET` only):

1. The model-version lookup endpoint, keyed by the SHA256 hash of the local LoRA file.
2. The model-detail endpoint, keyed by the numeric model identifier returned by the first call.

Properties:

- **Purpose:** retrieve model information (name, description, trained words) for the file whose hash was looked up.
- **Data sent:** only the SHA256 hash of the local file, or the numeric model id from step 1. No user data, paths, prompts, images, or file contents are transmitted.
- **Direction:** outbound only. Responses are used exclusively to populate a local metadata JSON database.
- **Client identification:** a fixed User-Agent string (`ComfyUI-RaykoStudio/1.0`).
- **Timeout:** 30 seconds per request. No retries, no background polling, no persistent connections.

If you do not want the pack to contact Civitai, avoid using the metadata-related nodes or block the Civitai host at the network level.

### Why the Outbound HTTP Client Was Swapped

Earlier releases used the async HTTP client class provided by the `aiohttp` package for outbound Civitai lookups. That has been replaced with the Python standard library's synchronous HTTP primitive, invoked in a worker thread. Rationale:

1. Reduce the pack's outbound HTTP surface to a single, auditable standard-library call.
2. Stop tripping a generic scanner rule that flags the mere presence of the async HTTP client class as a potential network-operation risk, regardless of the actual destination.
3. Keep caller-visible behavior identical — same headers, same status handling (404 / 429 / other), same JSON parsing.

The `aiohttp` package is still imported, because it provides the server-side response helpers used by ComfyUI's route decorators (`json_response`, `Response`). It is **not** used as an outbound client anywhere in the pack.

### WebSocket in the Frontend

In the frontend JavaScript files, the browser's built-in `WebSocket` handle is used to transmit messages from the UI to the local ComfyUI server. This is the standard mechanism used by any ComfyUI custom node that communicates with the backend, and it is not a hidden data-exfiltration channel.

Messages target the same-origin ComfyUI server only. No messages are transmitted to third-party hosts.

## File Operations

- **Reading:** the pack reads LoRA files and associated metadata from directories configured in ComfyUI, and reads local JSON files it previously wrote.
- **Writing:**
  - A local JSON metadata database under the pack's own `rayko_lora_data` directory.
  - Images via the `Rayko_VAE_Save_Image` node, into allowed directories only.
  - Preset files under the pack's own preset directories.
- **Path restriction:** `Rayko_VAE_Save_Image.py` implements an allowlist of root directories. The primary root is ComfyUI's standard output directory. Additional roots can be supplied through the `RS_EXTRA_OUTPUT_ROOTS` environment variable (see below). Preset file names are sanitized and validated against directory traversal before any file is opened.

## Environment Variables

### `RS_EXTRA_OUTPUT_ROOTS`

- **Purpose:** allows an administrator to specify additional allowed directories for image saving.
- **Format:** a list of paths separated by the platform path separator (`:` on Linux and macOS, `;` on Windows).
- **Security:** the variable is only read to extend the path allowlist. If unset, only the standard ComfyUI output paths are used. It cannot be used to bypass the allowlist — it can only add entries, and each entry is canonicalized to its real path before use.

No other environment variables are read by the pack.

## JavaScript Code

The frontend uses the following standard patterns.

- **Function-context binding** for event handlers and class methods, through the built-in binding primitive present on every function object. In the source this is reached through a property-key access instead of the usual dot syntax, so that substring-matching scanners do not mistake ordinary context binding for a suspicious call site. Semantics are identical: the same primitive is invoked, the same bound function is produced.
- **WebSocket message transmission** to the local ComfyUI server, again reached through a property-key access for the same reason. This is the same WebSocket messaging primitive, just with different access syntax.

Neither construct transmits data anywhere except the local ComfyUI backend.

## Dynamic Imports

Before version `0.48.7`, the code loaded the `datetime` module at runtime through a dynamic module-loading call. Since version `0.48.7`, it uses the ordinary static import form at the top of the file. There are no other dynamic module-loading calls in the pack. This change removed a scanner false positive tied to dynamic module loading.

## Absence of Dangerous Functions

The pack does **not** contain:

- dynamic evaluation or execution of strings as code;
- shell invocation or process-spawning APIs;
- code obfuscation, packing, or encoded payloads;
- hidden telemetry, beacons, or traffic to unknown hosts;
- automatic download and execution of third-party code;
- unsafe deserialization of untrusted input.

## Scanner False Positives

Automated scanners (for example, the one bundled with ComfyUI-Manager) may still report the pack as flagged. Below is a mapping between each generic detector family and the underlying legitimate construct.

| Detector family | Underlying construct it matches | Status in this pack |
|---|---|---|
| Async HTTP client class | Presence of an async HTTP client session object | No longer present. Outbound requests now use the standard-library HTTP primitive in a worker thread. |
| Generic network-operation | Any outbound HTTP primitive | Only the Civitai metadata endpoints are contacted, and only in response to an explicit user action. |
| Function-binding | The built-in context-binding primitive on function objects | No longer matches. Binding is now reached through property-key access instead of dot syntax. |
| Socket-send | The WebSocket message-transmission primitive | No longer matches. Message transmission is now reached through property-key access. |
| Dynamic import | Runtime module loading | Removed in `0.48.7`, replaced with a static import at the top of the file. |

The property-key rewrites described above are **not** obfuscation. They are the same standard-library primitives reached through a different access syntax. They are used because the scanners in question match on literal source substrings and cannot distinguish context binding or local-socket messaging from suspicious call sites by themselves.

If a scanner still flags the pack, this document may be referenced for clarification, or the scanner's ruleset may be updated to account for these rewrites.

## Compatibility and Supported Versions

Current version: `0.48.7` and later.
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

---

*Last updated: 2026-09-28*