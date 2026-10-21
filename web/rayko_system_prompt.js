import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "RSLoadSystemPrompt";

const API_LIST = "/rs_system_prompt_dropdown/get_prompts";
const API_CONTENT = "/rs_system_prompt_dropdown/get_prompt_content";
const API_SAVE = "/rs_system_prompt_dropdown/save_prompt";
const API_DELETE = "/rs_system_prompt_dropdown/delete_prompt";

const MENU_ID = "rs-spd-tree-menu";
const SAVE_MODAL_ID = "rs-spd-save-modal";
const CONFIRM_MODAL_ID = "rs-spd-confirm";


function toast(message, type = "info", node = null) {
    const existing = document.querySelector(".rs-spd-toast");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.className = "rs-spd-toast";
    const bg = type === "error" ? "#f44336" : type === "ok" ? "#4CAF50" : "#2196F3";
    el.style.cssText =
        `position:fixed;background:${bg};color:white;padding:12px 20px;` +
        `border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.4);` +
        `z-index:100001;font-size:14px;font-family:sans-serif;opacity:0;` +
        `transition:opacity 0.3s,transform 0.3s;transform:translateY(-20px);` +
        `pointer-events:none;white-space:nowrap;`;
    el.textContent = message;
    document.body.appendChild(el);

    const r = el.getBoundingClientRect();
    let left = window.innerWidth - r.width - 20;
    let top = 20;
    if (node && app?.canvas) {
        try {
            const cr = app.canvas.canvas.getBoundingClientRect();
            const s = app.canvas.ds.scale;
            const ox = app.canvas.ds.offset[0];
            const oy = app.canvas.ds.offset[1];
            const nx = cr.left + (node.pos[0] + node.size[0] / 2 + ox) * s;
            const ny = cr.top + (node.pos[1] + node.size[1] / 2 + oy) * s;
            left = Math.max(10, Math.min(nx - r.width / 2, window.innerWidth - r.width - 10));
            top = Math.max(10, Math.min(ny - r.height / 2, window.innerHeight - r.height - 10));
        } catch (e) { /* ignore */ }
    }
    el.style.left = left + "px";
    el.style.top = top + "px";
    void el.offsetWidth;
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(-20px)";
        setTimeout(() => el.remove(), 300);
    }, 3000);
}


function showConfirm(message, node = null) {
    return new Promise((resolve) => {
        const old = document.getElementById(CONFIRM_MODAL_ID);
        if (old) old.remove();

        const overlay = document.createElement("div");
        overlay.id = CONFIRM_MODAL_ID;
        overlay.style.cssText =
            "position:fixed;inset:0;background:rgba(0,0,0,0.55);" +
            "z-index:100003;display:flex;align-items:center;" +
            "justify-content:center;";

        const modal = document.createElement("div");
        modal.style.cssText =
            "background:#1f1f1f;border:1px solid #444;border-radius:8px;" +
            "width:380px;padding:16px;display:flex;flex-direction:column;" +
            "gap:14px;box-shadow:0 8px 30px rgba(0,0,0,0.8);" +
            "font-family:sans-serif;color:#ddd;";

        const text = document.createElement("div");
        text.textContent = message;
        text.style.cssText = "font-size:13px;line-height:1.5;color:#eee;white-space:pre-wrap;";

        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.cssText =
            "padding:6px 16px;background:#2a2a2a;color:#ddd;" +
            "border:1px solid #555;border-radius:4px;cursor:pointer;font-size:13px;";

        const okBtn = document.createElement("button");
        okBtn.textContent = "OK";
        okBtn.style.cssText =
            "padding:6px 16px;background:#1a3a1a;color:#aaffaa;" +
            "border:1px solid #4CAF50;border-radius:4px;cursor:pointer;" +
            "font-size:13px;font-weight:bold;";

        btnRow.append(cancelBtn, okBtn);
        modal.append(text, btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = (result) => {
            overlay.remove();
            document.removeEventListener("keydown", onKey, true);
            resolve(result);
        };

        const onKey = (ev) => {
            if (ev.key === "Escape") {
                ev.preventDefault();
                close(false);
            } else if (ev.key === "Enter") {
                ev.preventDefault();
                close(true);
            }
        };

        okBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            close(true);
        });
        cancelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            close(false);
        });
        overlay.addEventListener("pointerdown", (e) => {
            if (e.target === overlay) close(false);
        });

        document.addEventListener("keydown", onKey, true);

        requestAnimationFrame(() => okBtn.focus());
    });
}


function buildTree(list) {
    const tree = {};
    for (const item of list) {
        if (!item) continue;
        const parts = item.replace(/\\/g, "/").split("/");
        let cur = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const last = i === parts.length - 1;
            if (!cur[part]) cur[part] = last ? null : {};
            if (!last) cur = cur[part];
        }
    }
    return tree;
}

function collectPaths(tree, prefix = "") {
    const out = [];
    for (const name of Object.keys(tree)) {
        const sub = tree[name];
        const full = prefix ? `${prefix}/${name}` : name;
        const isFolder = sub !== null;
        out.push({ path: full, isFolder });
        if (isFolder) out.push(...collectPaths(sub, full));
    }
    return out;
}


app.registerExtension({
    name: "RaykoStudio.SystemPromptDropdown",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        const origOnConfigure = nodeType.prototype.onConfigure;
        const origOnRemoved = nodeType.prototype.onRemoved;

        nodeType.prototype._getWidget = function (name) {
            return this.widgets?.find((w) => w.name === name);
        };

        nodeType.prototype._getSystemPrompt = function () {
            const w = this._getWidget("system_prompt");
            return w ? (w.value ?? "") : "";
        };

        nodeType.prototype._setSystemPrompt = function (text) {
            const w = this._getWidget("system_prompt");
            if (!w) return;
            w.value = text ?? "";
            if (typeof w.callback === "function") {
                try { w.callback(w.value); } catch (e) { /* ignore */ }
            }
            this.graph?.setDirtyCanvas(true, true);
        };

        nodeType.prototype._syncSelected = function () {
            const sel = this._getWidget("selected_file");
            if (sel) sel.value = this.selectedFile || "";

            const pf = this._getWidget("prompt_file");
            if (pf) pf.value = this.selectedFile || "";

            if (!this.properties) this.properties = {};
            this.properties.selected_file = this.selectedFile || "";

            this._updateBtnLabel();
            this.graph?.setDirtyCanvas(true, true);
        };

        nodeType.prototype._isDirty = function () {
            const current = this._getSystemPrompt();
            return current !== (this.lastLoadedContent ?? "");
        };

        nodeType.prototype._btnLabel = function () {
            const name = this.selectedFile || "SELECT SYSTEM PROMPT…";
            const star = this._isDirty() ? " *" : "";
            return `📄 ${name}${star}`;
        };

        nodeType.prototype._updateBtnLabel = function () {
            if (this._promptBtnEl) {
                this._promptBtnEl.textContent = this._btnLabel();
                this._promptBtnEl.title = this.selectedFile || "";
            }
        };

        nodeType.prototype.loadFiles = async function (showToastOnError = false) {
            try {
                const res = await api.fetchApi(API_LIST, { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                this.filesCache = Array.isArray(data.files) ? data.files : [];
                this.treeCache = buildTree(this.filesCache);
            } catch (err) {
                console.error("[RSLoadSystemPrompt] loadFiles error:", err);
                this.filesCache = [];
                this.treeCache = {};
                if (showToastOnError) {
                    toast(`Failed to load prompts: ${err.message}`, "error", this);
                }
            }
        };

        nodeType.prototype.fetchPromptContent = async function (filename) {
            const url = `${API_CONTENT}?file=${encodeURIComponent(filename)}`;
            const res = await api.fetchApi(url, { cache: "no-store" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            return data.content ?? "";
        };

        nodeType.prototype.savePromptContent = async function (filename, content) {
            const res = await api.fetchApi(API_SAVE, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename, content }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            return data;
        };

        nodeType.prototype.deletePromptFile = async function (filename) {
            const res = await api.fetchApi(API_DELETE, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            return data;
        };

        nodeType.prototype.handleDeleteFile = async function (filename, refreshCallback) {
            const ok = await showConfirm(
                `Delete file "${filename}"?\nThis action cannot be undone.`,
                this
            );
            if (!ok) return;

            try {
                await this.deletePromptFile(filename);
                toast(`Deleted: ${filename}`, "ok", this);

                if (this.selectedFile === filename) {
                    this.selectedFile = "";
                    this._setSystemPrompt("");
                    this.lastLoadedContent = "";
                    this._syncSelected();
                    this._updateBtnLabel();
                }

                await this.loadFiles(false);
                if (refreshCallback) refreshCallback();
            } catch (err) {
                toast(`Delete failed: ${err.message}`, "error", this);
            }
        };

        nodeType.prototype.onNodeCreated = function () {
            const result = origOnNodeCreated
                ? origOnNodeCreated.apply(this, arguments)
                : undefined;
            const self = this;

            this.selectedFile = "";
            this.filesCache = [];
            this.treeCache = {};
            this.lastLoadedContent = "";
            this._promptBtnEl = null;
            this._reloadBtnEl = null;
            this._saveBtnEl = null;

            for (const name of ["prompt_file", "selected_file"]) {
                const w = this._getWidget(name);
                if (w) {
                    w.hidden = true;
                    if (w.element) w.element.style.display = "none";
                    w.computeSize = () => [0, 0];
                }
            }

            const sysHeader = document.createElement("div");
            sysHeader.style.cssText =
                "position:relative;display:flex;align-items:center;" +
                "justify-content:center;width:100%;box-sizing:border-box;" +
                "padding:6px 2px 0 2px;";

            const sysLabel = document.createElement("div");
            sysLabel.textContent = "SYSTEM PROMPT";
            sysLabel.style.cssText =
                "font-size:10px;font-weight:bold;letter-spacing:1px;" +
                "color:#888;text-transform:uppercase;user-select:none;" +
                "line-height:12px;text-align:center;";
            sysHeader.appendChild(sysLabel);

            const btnGroup = document.createElement("div");
            btnGroup.style.cssText = "position:absolute;right:2px;display:flex;gap:4px;";

            const reloadBtn = document.createElement("button");
            reloadBtn.textContent = "⟳";
            reloadBtn.title = "Reload from file";
            reloadBtn.style.cssText =
                "width:36px;height:20px;padding:0;font-size:13px;" +
                "border:1px solid #555;border-radius:4px;background:#2a2a2a;" +
                "color:#ddd;cursor:pointer;line-height:1;box-sizing:border-box;" +
                "display:flex;align-items:center;justify-content:center;";
            reloadBtn.onmouseenter = () => (reloadBtn.style.background = "#3a3a3a");
            reloadBtn.onmouseleave = () => (reloadBtn.style.background = "#2a2a2a");
            reloadBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                self.reloadFromFile();
            });
            this._reloadBtnEl = reloadBtn;

            const saveBtn = document.createElement("button");
            saveBtn.textContent = "💾";
            saveBtn.title = "Save system prompt to file";
            saveBtn.style.cssText =
                "width:36px;height:20px;padding:0;font-size:13px;" +
                "border:1px solid #555;border-radius:4px;background:#2a2a2a;" +
                "color:#ddd;cursor:pointer;line-height:1;box-sizing:border-box;" +
                "display:flex;align-items:center;justify-content:center;";
            saveBtn.onmouseenter = () => (saveBtn.style.background = "#3a3a3a");
            saveBtn.onmouseleave = () => (saveBtn.style.background = "#2a2a2a");
            saveBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                self.openSaveModal();
            });
            this._saveBtnEl = saveBtn;

            btnGroup.append(reloadBtn, saveBtn);
            sysHeader.appendChild(btnGroup);

            const sysHeaderWidget = this.addDOMWidget(
                "rs_spd_sys_header", "custom", sysHeader
            );
            sysHeaderWidget.computeSize = () => [this.width || 200, 22];

            const topContainer = document.createElement("div");
            topContainer.style.cssText =
                "display:flex;flex-direction:column;gap:2px;" +
                "width:100%;box-sizing:border-box;padding-top:8px;";

            const topLabel = document.createElement("div");
            topLabel.textContent = "LOAD SYSTEM PROMPT";
            topLabel.style.cssText =
                "font-size:10px;font-weight:bold;letter-spacing:1px;" +
                "color:#888;text-transform:uppercase;text-align:center;" +
                "padding:0 2px;user-select:none;line-height:12px;";
            topContainer.appendChild(topLabel);

            const loadBtn = document.createElement("button");
            loadBtn.textContent = this._btnLabel();
            loadBtn.style.cssText =
                "width:100%;height:28px;padding:0 10px;font-size:12px;" +
                "border:1px solid #4CAF50;border-radius:5px;background:#1a3a1a;" +
                "color:#aaffaa;cursor:pointer;box-sizing:border-box;" +
                "text-align:center;text-transform:uppercase;letter-spacing:0.5px;" +
                "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" +
                "font-weight:bold;display:block;";
            loadBtn.onmouseenter = () => (loadBtn.style.background = "#2a4a2a");
            loadBtn.onmouseleave = () => (loadBtn.style.background = "#1a3a1a");
            loadBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await self.loadFiles(true);
                self.showTreeMenu();
            });
            this._promptBtnEl = loadBtn;
            topContainer.appendChild(loadBtn);

            const topWidget = this.addDOMWidget("rs_spd_btn", "custom", topContainer);
            topWidget.computeSize = () => [this.width || 200, 58];

            const userHeader = document.createElement("div");
            userHeader.style.cssText =
                "display:flex;align-items:center;justify-content:center;" +
                "width:100%;box-sizing:border-box;padding:6px 2px 0 2px;";

            const userLabel = document.createElement("div");
            userLabel.textContent = "USER PROMPT";
            userLabel.style.cssText =
                "font-size:10px;font-weight:bold;letter-spacing:1px;" +
                "color:#888;text-transform:uppercase;user-select:none;" +
                "line-height:12px;text-align:center;";
            userHeader.appendChild(userLabel);

            const userHeaderWidget = this.addDOMWidget(
                "rs_spd_user_header", "custom", userHeader
            );
            userHeaderWidget.computeSize = () => [this.width || 200, 22];

            const sysPromptWidget = this._getWidget("system_prompt");
            const promptWidget = this._getWidget("prompt");

            if (sysPromptWidget && promptWidget) {
                this.widgets = [
                    sysHeaderWidget,
                    sysPromptWidget,
                    topWidget,
                    userHeaderWidget,
                    promptWidget
                ];
            }

            if (sysPromptWidget) {
                if (sysPromptWidget.element) {
                    sysPromptWidget.element.addEventListener("input", () => {
                        self._updateBtnLabel();
                    });
                }
                const origCallback = sysPromptWidget.callback;
                sysPromptWidget.callback = (...args) => {
                    const r = typeof origCallback === "function"
                        ? origCallback.apply(sysPromptWidget, args)
                        : undefined;
                    self._updateBtnLabel();
                    return r;
                };
            }

            const origOnResize = this.onResize;
            this.onResize = function (size) {
                if (size[0] < 360) size[0] = 360;
                const minH = self.computeSize()[1] + 8;
                if (size[1] < minH) size[1] = minH;
                return origOnResize
                    ? origOnResize.apply(this, arguments)
                    : undefined;
            };

            const startH = this.computeSize()[1] + 8;
            this.setSize([Math.max(this.size[0], 360), startH]);

            this.loadFiles(false).then(() => {
                const pf = this._getWidget("prompt_file");
                const sel = this._getWidget("selected_file");
                const candidate = (sel?.value || pf?.value || "").trim();
                if (candidate && this.filesCache.includes(candidate)) {
                    this.selectedFile = candidate;
                } else if (this.filesCache.length && !this._getSystemPrompt()) {
                    this.selectedFile = this.filesCache[0];
                } else {
                    this.selectedFile = candidate;
                }
                this._syncSelected();
                this._updateBtnLabel();
            });

            return result;
        };

        nodeType.prototype.onDrawForeground = function (ctx) {
            const minHeight = this.computeSize()[1] + 8;
            if (this.size[1] < minHeight) {
                this.size[1] = minHeight;
                this.graph?.setDirtyCanvas(true, true);
            }
        };

        nodeType.prototype.onConfigure = function (info) {
            const self = this;

            let saved = "";
            if (info?.properties?.selected_file) {
                saved = info.properties.selected_file;
            } else {
                const sel = this._getWidget("selected_file");
                if (sel?.value) saved = sel.value;
            }
            this.selectedFile = saved || "";

            const currentText = this._getSystemPrompt();

            this.loadFiles(false).then(async () => {
                if (!self.selectedFile) {
                    self.lastLoadedContent = currentText;
                    self._syncSelected();
                    return;
                }
                try {
                    const disk = await self.fetchPromptContent(self.selectedFile);
                    self.lastLoadedContent = disk;
                } catch (err) {
                    self.lastLoadedContent = "\u0000__none__\u0000";
                }
                self._syncSelected();
                self._updateBtnLabel();
            });

            return origOnConfigure
                ? origOnConfigure.apply(this, arguments)
                : undefined;
        };

        nodeType.prototype.onRemoved = function () {
            const menu = document.getElementById(MENU_ID);
            if (menu) menu.remove();
            const modal = document.getElementById(SAVE_MODAL_ID);
            if (modal) modal.remove();
            const confirmModal = document.getElementById(CONFIRM_MODAL_ID);
            if (confirmModal) confirmModal.remove();
            return origOnRemoved
                ? origOnRemoved.apply(this, arguments)
                : undefined;
        };

        nodeType.prototype.reloadFromFile = async function () {
            if (!this.selectedFile) {
                toast("No file selected", "error", this);
                return;
            }
            if (this._isDirty()) {
                const ok = await showConfirm(
                    "Discard unsaved changes and reload from file?",
                    this
                );
                if (!ok) return;
            }
            try {
                const content = await this.fetchPromptContent(this.selectedFile);
                this._setSystemPrompt(content);
                this.lastLoadedContent = content;
                this._updateBtnLabel();
                toast(`Reloaded: ${this.selectedFile}`, "ok", this);
            } catch (err) {
                toast(`Reload failed: ${err.message}`, "error", this);
            }
        };

        nodeType.prototype.showTreeMenu = function () {
            const self = this;
            const old = document.getElementById(MENU_ID);
            if (old) old.remove();

            const mw = 460;
            const mh = 600;
            const expanded = {};

            const menu = document.createElement("div");
            menu.id = MENU_ID;
            menu.style.cssText =
                `position:fixed;background:#1a1a1a;border:1px solid #444;` +
                `border-radius:6px;height:${mh}px;width:${mw}px;` +
                `overflow-y:auto;overflow-x:hidden;z-index:10000;` +
                `box-shadow:0 4px 20px rgba(0,0,0,0.8);display:flex;` +
                `flex-direction:column;`;

            const hc = document.createElement("div");
            hc.style.cssText =
                "padding:10px;background:#252525;border-bottom:1px solid #333;" +
                "display:flex;flex-direction:column;gap:8px;flex-shrink:0;";

            const titleRow = document.createElement("div");
            titleRow.style.cssText =
                "display:flex;justify-content:space-between;align-items:center;";

            const title = document.createElement("div");
            title.textContent = "System Prompt";
            title.style.cssText = "color:#fff;font-weight:bold;font-size:14px;";

            const refreshBtn = document.createElement("button");
            refreshBtn.textContent = "🔄 Refresh";
            refreshBtn.title = "Rescan system_prompts folder";
            refreshBtn.style.cssText =
                "padding:4px 10px;background:#2a2a2a;color:#ddd;" +
                "border:1px solid #555;border-radius:4px;cursor:pointer;" +
                "font-size:12px;";
            refreshBtn.onmouseenter = () => (refreshBtn.style.background = "#3a3a3a");
            refreshBtn.onmouseleave = () => (refreshBtn.style.background = "#2a2a2a");

            titleRow.append(title, refreshBtn);

            const si = document.createElement("input");
            si.type = "text";
            si.placeholder = "Type to search...";
            si.style.cssText =
                "width:100%;padding:8px;background:#333;border:1px solid #555;" +
                "color:#fff;border-radius:4px;outline:none;font-size:13px;" +
                "box-sizing:border-box;";
            hc.append(titleRow, si);
            menu.appendChild(hc);

            const lc = document.createElement("div");
            lc.style.cssText = "padding:5px 0;overflow-y:auto;flex-grow:1;";
            menu.appendChild(lc);

            let rafId = null;

            const closeMenu = () => {
                if (menu.parentNode) menu.remove();
                document.removeEventListener("pointerdown", onOutside, true);
                document.removeEventListener("keydown", onKey, true);
                if (rafId) cancelAnimationFrame(rafId);
            };

            const pick = async (path) => {
                closeMenu();
                try {
                    const content = await self.fetchPromptContent(path);
                    self.selectedFile = path;
                    self._setSystemPrompt(content);
                    self.lastLoadedContent = content;
                    self._syncSelected();
                    self._updateBtnLabel();
                } catch (err) {
                    toast(`Failed to load: ${err.message}`, "error", self);
                }
            };

            const render = (filter = "") => {
                lc.innerHTML = "";
                const lf = filter.trim().toLowerCase();

                if (!self.filesCache.length) {
                    const em = document.createElement("div");
                    em.textContent = "No .txt files in system_prompts/";
                    em.style.cssText =
                        "padding:20px;color:#f44336;text-align:center;font-style:italic;";
                    lc.appendChild(em);
                    return;
                }

                if (lf.length > 0) {
                    const all = collectPaths(self.treeCache)
                        .filter((p) => !p.isFolder && p.path.toLowerCase().includes(lf))
                        .sort((a, b) => a.path.localeCompare(b.path));
                    if (!all.length) {
                        const nr = document.createElement("div");
                        nr.textContent = `No results for "${filter}"`;
                        nr.style.cssText =
                            "padding:15px;color:#777;text-align:center;font-style:italic;";
                        lc.appendChild(nr);
                        return;
                    }
                    all.forEach((it) => {
                        const active = self.selectedFile === it.path;
                        const el = document.createElement("div");
                        el.textContent = (active ? "✓ " : " ") + it.path;
                        el.style.cssText =
                            `padding:8px 12px;cursor:pointer;font-size:12px;` +
                            `border-bottom:1px solid #2a2a2a;` +
                            `color:${active ? "#4CAF50" : "#ddd"};`;
                        el.onmouseenter = () => (el.style.background = "#333");
                        el.onmouseleave = () => (el.style.background = "transparent");
                        el.onclick = (e) => {
                            e.stopPropagation();
                            pick(it.path);
                        };
                        lc.appendChild(el);
                    });
                    return;
                }

                renderTree("", self.treeCache, 0, lc, expanded, self, (path) => pick(path));
            };

            render("");

            document.body.appendChild(menu);

            const anchor = self._promptBtnEl;
            const positionMenu = () => {
                if (!anchor || !menu.parentNode || !anchor.isConnected) return false;
                const r = anchor.getBoundingClientRect();
                let left = r.left;
                let top = r.bottom + 4;
                if (left + mw > window.innerWidth - 10) left = window.innerWidth - mw - 10;
                if (left < 10) left = 10;
                if (top + mh > window.innerHeight - 10) top = r.top - mh - 4;
                if (top < 10) top = 10;
                menu.style.left = left + "px";
                menu.style.top = top + "px";
                return true;
            };
            positionMenu();

            rafId = requestAnimationFrame(function tick() {
                if (!menu.parentNode) {
                    rafId = null;
                    return;
                }
                if (!positionMenu()) {
                    closeMenu();
                    return;
                }
                rafId = requestAnimationFrame(tick);
            });

            let tid = null;
            si.addEventListener("input", (e) => {
                if (tid) clearTimeout(tid);
                tid = setTimeout(() => render(e.target.value), 50);
            });

            refreshBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                refreshBtn.disabled = true;
                refreshBtn.textContent = "⏳ ...";
                const before = self.filesCache.length;
                await self.loadFiles(true);
                const after = self.filesCache.length;
                refreshBtn.disabled = false;
                refreshBtn.textContent = "🔄 Refresh";
                toast(`Reloaded: ${after} file(s) (was ${before})`, "ok", self);
                render(si.value || "");
            });

            const onKey = (ev) => {
                if (ev.key === "Escape") closeMenu();
            };
            const onOutside = (ev) => {
                if (!menu.contains(ev.target)) closeMenu();
            };
            setTimeout(() => {
                document.addEventListener("pointerdown", onOutside, true);
                document.addEventListener("keydown", onKey, true);
                si.focus();
            }, 50);
        };

        nodeType.prototype.openSaveModal = function () {
            const self = this;
            const old = document.getElementById(SAVE_MODAL_ID);
            if (old) old.remove();

            const currentText = this._getSystemPrompt();
            const defaultName = this.selectedFile || "";

            const overlay = document.createElement("div");
            overlay.id = SAVE_MODAL_ID;
            overlay.style.cssText =
                "position:fixed;inset:0;background:rgba(0,0,0,0.55);" +
                "z-index:100002;display:flex;align-items:center;" +
                "justify-content:center;";

            const modal = document.createElement("div");
            modal.style.cssText =
                "background:#1f1f1f;border:1px solid #444;border-radius:8px;" +
                "width:440px;padding:16px;display:flex;flex-direction:column;" +
                "gap:12px;box-shadow:0 8px 30px rgba(0,0,0,0.8);" +
                "font-family:sans-serif;color:#ddd;";

            const title = document.createElement("div");
            title.textContent = "Save System Prompt";
            title.style.cssText = "font-size:15px;font-weight:bold;color:#fff;";

            const hint = document.createElement("div");
            hint.textContent =
                "Enter a file name (relative to system_prompts/). " +
                "Subfolders are allowed, .txt is added automatically.";
            hint.style.cssText = "font-size:12px;color:#888;";

            const input = document.createElement("input");
            input.type = "text";
            input.value = defaultName;
            input.placeholder = "prompts/new_prompt.txt";
            input.style.cssText =
                "width:100%;padding:8px 10px;background:#111;color:#fff;" +
                "border:1px solid #555;border-radius:4px;font-size:13px;" +
                "box-sizing:border-box;outline:none;";

            const btnRow = document.createElement("div");
            btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

            const cancelBtn = document.createElement("button");
            cancelBtn.textContent = "Cancel";
            cancelBtn.style.cssText =
                "padding:6px 16px;background:#2a2a2a;color:#ddd;" +
                "border:1px solid #555;border-radius:4px;cursor:pointer;font-size:13px;";

            const saveBtn = document.createElement("button");
            saveBtn.textContent = "Save";
            saveBtn.style.cssText =
                "padding:6px 16px;background:#1a3a1a;color:#aaffaa;" +
                "border:1px solid #4CAF50;border-radius:4px;cursor:pointer;" +
                "font-size:13px;font-weight:bold;";

            btnRow.append(cancelBtn, saveBtn);
            modal.append(title, hint, input, btnRow);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const close = () => {
                overlay.remove();
                document.removeEventListener("keydown", onKey, true);
            };

            const normalizeName = (raw) => {
                let name = (raw || "").trim().replace(/\\/g, "/");
                if (!name) return "";
                if (!name.toLowerCase().endsWith(".txt")) name += ".txt";
                return name;
            };

            const doSave = async () => {
                const name = normalizeName(input.value);
                if (!name) {
                    toast("Enter a file name", "error", self);
                    input.focus();
                    return;
                }

                const nameChanged = name !== (self.selectedFile || "");
                if (nameChanged && self.filesCache.includes(name)) {
                    const ok = await showConfirm(
                        `File "${name}" already exists. Overwrite?`,
                        self
                    );
                    if (!ok) return;
                }

                saveBtn.disabled = true;
                saveBtn.textContent = "⏳ ...";
                try {
                    const data = await self.savePromptContent(name, currentText);
                    self.selectedFile = data.path;
                    self.lastLoadedContent = currentText;
                    await self.loadFiles(false);
                    self._syncSelected();
                    self._updateBtnLabel();
                    toast(
                        data.created
                            ? `Saved as: ${data.path}`
                            : `Saved: ${data.path}`,
                        "ok",
                        self
                    );
                    close();
                } catch (err) {
                    toast(`Save failed: ${err.message}`, "error", self);
                    saveBtn.disabled = false;
                    saveBtn.textContent = "Save";
                }
            };

            const onKey = (ev) => {
                if (ev.key === "Escape") {
                    ev.preventDefault();
                    close();
                } else if (ev.key === "Enter" && document.activeElement === input) {
                    ev.preventDefault();
                    doSave();
                }
            };

            saveBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                doSave();
            });
            cancelBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                close();
            });
            overlay.addEventListener("pointerdown", (e) => {
                if (e.target === overlay) close();
            });

            document.addEventListener("keydown", onKey, true);

            requestAnimationFrame(() => {
                input.focus();
                input.select();
            });
        };
    },
});


function renderTree(prefix, tree, level, container, expanded, self, onPick) {
    const keys = Object.keys(tree).sort((a, b) => {
        const af = tree[a] !== null;
        const bf = tree[b] !== null;
        if (af && !bf) return -1;
        if (!af && bf) return 1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    for (const name of keys) {
        const sub = tree[name];
        const isFolder = sub !== null;
        const full = prefix ? `${prefix}/${name}` : name;

        if (isFolder) {
            const fh = document.createElement("div");
            fh.style.cssText =
                `padding:8px 12px;cursor:pointer;color:#ffd700;font-size:13px;` +
                `background:#252525;display:flex;align-items:center;` +
                `padding-left:${12 + level * 16}px;`;
            fh.innerHTML =
                `<span style="margin-right:8px;">${expanded[full] ? "▼" : "▶"}</span>📁 ${name}`;
            fh.onclick = (e) => {
                e.stopPropagation();
                expanded[full] = !expanded[full];
                container.innerHTML = "";
                renderTree("", self.treeCache, 0, container, expanded, self, onPick);
            };
            container.appendChild(fh);
            if (expanded[full]) {
                renderTree(full, sub, level + 1, container, expanded, self, onPick);
            }
        } else {
            const active = self.selectedFile === full;
            const row = document.createElement("div");
            row.style.cssText =
                `display:flex;align-items:center;justify-content:space-between;` +
                `padding:8px 12px;padding-left:${12 + level * 16}px;` +
                `cursor:pointer;border-bottom:1px solid #2a2a2a;` +
                `color:${active ? "#4CAF50" : "#ddd"};font-size:12px;`;

            row.onmouseenter = () => (row.style.background = "#333");
            row.onmouseleave = () => (row.style.background = "transparent");

            const nameSpan = document.createElement("span");
            nameSpan.textContent = (active ? "✓ " : " ") + "📄 " + name;
            nameSpan.style.cssText = "flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

            const delBtn = document.createElement("div");
            delBtn.textContent = "❌";
            delBtn.title = "Delete file";
            delBtn.style.cssText =
                "margin-left:8px;padding:0 4px;opacity:0.6;cursor:pointer;" +
                "transition:opacity 0.2s;font-size:14px;line-height:1;";

            delBtn.onmouseenter = (e) => {
                e.stopPropagation();
                delBtn.style.opacity = "1";
                delBtn.style.color = "#f44336";
            };
            delBtn.onmouseleave = (e) => {
                e.stopPropagation();
                delBtn.style.opacity = "0.6";
                delBtn.style.color = "inherit";
            };

            delBtn.onclick = (e) => {
                e.stopPropagation();
                self.handleDeleteFile(full, () => {
                    const input = container.closest(`#${MENU_ID}`)?.querySelector("input");
                    const filter = input ? input.value : "";

                    container.innerHTML = "";
                    if (filter && filter.trim()) {
                        const lf = filter.trim().toLowerCase();
                        const all = collectPaths(self.treeCache)
                            .filter((p) => !p.isFolder && p.path.toLowerCase().includes(lf))
                            .sort((a, b) => a.path.localeCompare(b.path));

                        if (!all.length) {
                            const nr = document.createElement("div");
                            nr.textContent = `No results for "${filter}"`;
                            nr.style.cssText = "padding:15px;color:#777;text-align:center;font-style:italic;";
                            container.appendChild(nr);
                        } else {
                            all.forEach((it) => {
                                const isAct = self.selectedFile === it.path;
                                const r = document.createElement("div");
                                r.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #2a2a2a;color:${isAct ? "#4CAF50" : "#ddd"};`;
                                r.onmouseenter = () => (r.style.background = "#333");
                                r.onmouseleave = () => (r.style.background = "transparent");

                                const span = document.createElement("span");
                                span.textContent = (isAct ? "✓ " : " ") + it.path;
                                span.style.cssText = "flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

                                const d = document.createElement("div");
                                d.textContent = "❌";
                                d.title = "Delete file";
                                d.style.cssText = "margin-left:8px;padding:0 4px;opacity:0.6;cursor:pointer;transition:opacity 0.2s;font-size:14px;line-height:1;";
                                d.onmouseenter = (e) => { e.stopPropagation(); d.style.opacity = "1"; d.style.color = "#f44336"; };
                                d.onmouseleave = (e) => { e.stopPropagation(); d.style.opacity = "0.6"; d.style.color = "inherit"; };
                                d.onclick = (e) => { e.stopPropagation(); self.handleDeleteFile(it.path, () => { /* nested? rare */ }); };

                                r.appendChild(span);
                                r.appendChild(d);
                                r.onclick = (e) => { e.stopPropagation(); onPick(it.path); };
                                container.appendChild(r);
                            });
                        }
                    } else {
                        renderTree("", self.treeCache, 0, container, expanded, self, onPick);
                    }
                });
            };

            row.appendChild(nameSpan);
            row.appendChild(delBtn);
            row.onclick = (e) => {
                e.stopPropagation();
                onPick(full);
            };
            container.appendChild(row);
        }
    }
}
