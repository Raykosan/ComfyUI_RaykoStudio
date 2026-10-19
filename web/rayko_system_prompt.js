import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const API_PATH = "/rs_system_prompt_dropdown/get_prompts";
const NODE_NAME = "RSLoadSystemPrompt";
const MENU_ID = "rs-spd-tree-menu";

function showToast(message, type = "info", node = null) {
    const existing = document.querySelector(".rs-spd-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "rs-spd-toast";
    const bg = type === "error" ? "#f44336" : type === "ok" ? "#4CAF50" : "#2196F3";
    toast.style.cssText = `position:fixed;background:${bg};color:white;padding:12px 20px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.4);z-index:100000;font-size:14px;font-family:sans-serif;opacity:0;transition:opacity 0.3s,transform 0.3s;transform:translateY(-20px);pointer-events:none;white-space:nowrap;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    const r = toast.getBoundingClientRect();
    let left = window.innerWidth - r.width - 20, top = 20;
    if (node && app?.canvas) {
        try {
            const cr = app.canvas.canvas.getBoundingClientRect();
            const s = app.canvas.ds.scale;
            const ox = app.canvas.ds.offset[0], oy = app.canvas.ds.offset[1];
            const nx = cr.left + (node.pos[0] + node.size[0] / 2 + ox) * s;
            const ny = cr.top + (node.pos[1] + node.size[1] / 2 + oy) * s;
            left = Math.max(10, Math.min(nx - r.width / 2, window.innerWidth - r.width - 10));
            top = Math.max(10, Math.min(ny - r.height / 2, window.innerHeight - r.height - 10));
        } catch (e) { /* ignore */ }
    }
    toast.style.left = left + "px";
    toast.style.top = top + "px";
    void toast.offsetWidth;
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-20px)";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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

        nodeType.prototype._btnLabel = function () {
            return this.selectedFile
                ? `📄 ${this.selectedFile}`
                : "📄 Select system prompt…";
        };

        nodeType.prototype._updateBtnLabel = function () {
            if (this._promptBtnEl) {
                this._promptBtnEl.textContent = this._btnLabel();
                this._promptBtnEl.title = this.selectedFile || "";
            }
        };

        nodeType.prototype._syncSelected = function () {
            const selWidget = this.widgets?.find((w) => w.name === "selected_file");
            if (selWidget) selWidget.value = this.selectedFile || "";

            const pf = this.widgets?.find((w) => w.name === "prompt_file");
            if (pf) {
                const validList = Array.isArray(pf.options?.values)
                    ? pf.options.values
                    : [];
                if (this.selectedFile && validList.includes(this.selectedFile)) {
                    pf.value = this.selectedFile;
                } else if (validList.length) {
                    pf.value = validList[0];
                    this.selectedFile = validList[0];
                } else {
                    pf.value = this.selectedFile || "";
                }
            }

            if (!this.properties) this.properties = {};
            this.properties.selected_file = this.selectedFile || "";

            this._updateBtnLabel();
            this.graph?.setDirtyCanvas(true, true);
        };

        nodeType.prototype.loadFiles = async function (showToastOnError = false) {
            try {
                const res = await api.fetchApi(API_PATH, { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                this.filesCache = Array.isArray(data.files) ? data.files : [];
                this.treeCache = buildTree(this.filesCache);
            } catch (err) {
                console.error("[RSLoadSystemPrompt] loadFiles error:", err);
                this.filesCache = [];
                this.treeCache = {};
                if (showToastOnError) {
                    showToast(`Failed to load prompts: ${err.message}`, "error", this);
                }
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
            this._promptBtnEl = null;

            const comboWidget = this.widgets?.find((w) => w.name === "prompt_file");
            if (comboWidget) {
                comboWidget.hidden = true;
                if (comboWidget.element) comboWidget.element.style.display = "none";
                comboWidget.computeSize = () => [0, 0];
            }

            const selWidget = this.widgets?.find((w) => w.name === "selected_file");
            if (selWidget) {
                selWidget.hidden = true;
                if (selWidget.element) selWidget.element.style.display = "none";
            }

            if (this.properties?.selected_file) {
                this.selectedFile = this.properties.selected_file;
            } else if (comboWidget?.value) {
                this.selectedFile = comboWidget.value;
            }

            const btnContainer = document.createElement("div");
            btnContainer.style.cssText =
                "display:flex;flex-direction:column;gap:2px;" +
                "width:100%;box-sizing:border-box;";

            const label = document.createElement("div");
            label.textContent = "LOAD SYSTEM PROMPT";
            label.style.cssText =
                "font-size:10px;font-weight:bold;letter-spacing:1px;" +
                "color:#888;text-transform:uppercase;text-align:center;" +
                "padding:0 2px;user-select:none;line-height:12px;";
            btnContainer.appendChild(label);

            const btn = document.createElement("button");
            btn.textContent = this._btnLabel();
            btn.style.cssText =
                "width:100%;height:28px;padding:0 10px;font-size:12px;" +
                "border:1px solid #4CAF50;border-radius:5px;background:#1a3a1a;" +
                "color:#aaffaa;cursor:pointer;box-sizing:border-box;" +
                "text-align:center;text-transform:uppercase;letter-spacing:0.5px;" +
                "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" +
                "font-weight:bold;display:block;";
            btn.onmouseenter = () => (btn.style.background = "#2a4a2a");
            btn.onmouseleave = () => (btn.style.background = "#1a3a1a");

            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await self.loadFiles(true);
                self.showTreeMenu();
            });

            this._promptBtnEl = btn;
            btnContainer.appendChild(btn);

            const domWidget = this.addDOMWidget("rs_spd_btn", "custom", btnContainer);
            domWidget.computeSize = () => [this.width || 200, 50];

            const origOnResize = this.onResize;
            this.onResize = function (size) {
                if (size[0] < 320) size[0] = 320;
                const minH = self.computeSize()[1];
                if (size[1] < minH) size[1] = minH;
                return origOnResize
                    ? origOnResize.apply(this, arguments)
                    : undefined;
            };

            const startH = this.computeSize()[1] + 8;
            this.setSize([Math.max(this.size[0], 320), startH]);

            this.loadFiles(false).then(() => {
                if (!this.selectedFile && this.filesCache.length) {
                    this.selectedFile = this.filesCache[0];
                }
                const pf = this.widgets?.find((w) => w.name === "prompt_file");
                if (pf && !pf.value && this.selectedFile) {
                    pf.value = this.selectedFile;
                }
                this._syncSelected();
                this._updateBtnLabel();
                this.graph?.setDirtyCanvas(true, true);
            });

            return result;
        };

        nodeType.prototype.onDrawForeground = function (ctx) {
            const padding = 8;
            const minHeight = this.computeSize()[1] + padding;
            if (this.size[1] < minHeight) {
                this.size[1] = minHeight;
                this.graph?.setDirtyCanvas(true, true);
            }
        };

        nodeType.prototype.onConfigure = function (info) {
            let saved = "";
            if (info?.properties?.selected_file) {
                saved = info.properties.selected_file;
            } else if (this.widgets) {
                const selWidget = this.widgets.find((w) => w.name === "selected_file");
                if (selWidget?.value) saved = selWidget.value;
            }

            const self = this;
            this.loadFiles(false).then(() => {
                if (saved && self.filesCache.includes(saved)) {
                    self.selectedFile = saved;
                } else if (self.filesCache.length) {
                    self.selectedFile = self.filesCache[0];
                } else {
                    self.selectedFile = "";
                }
                self._syncSelected();
            });

            return origOnConfigure
                ? origOnConfigure.apply(this, arguments)
                : undefined;
        };

        nodeType.prototype.onRemoved = function () {
            const existing = document.getElementById(MENU_ID);
            if (existing) existing.remove();
            return origOnRemoved
                ? origOnRemoved.apply(this, arguments)
                : undefined;
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

            const pick = (path) => {
                self.selectedFile = path;
                self._syncSelected();
                closeMenu();
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

                renderTree("", self.treeCache, 0, lc, expanded, self, pick);
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
                showToast(`Reloaded: ${after} file(s) (was ${before})`, "ok", self);
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
            const fi = document.createElement("div");
            fi.textContent = (active ? "✓ " : " ") + "📄 " + name;
            fi.style.cssText =
                `padding:8px 12px;cursor:pointer;font-size:12px;` +
                `padding-left:${12 + level * 16}px;` +
                `color:${active ? "#4CAF50" : "#ddd"};`;
            fi.onmouseenter = () => (fi.style.background = "#333");
            fi.onmouseleave = () => (fi.style.background = "transparent");
            fi.onclick = (e) => {
                e.stopPropagation();
                onPick(full);
            };
            container.appendChild(fi);
        }
    }
}