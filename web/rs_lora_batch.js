import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function showToast(message, type = "error", node = null) {
    const existing = document.querySelector(".rs-batch-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "rs-batch-toast";
    const bg = type === "error" ? "#f44336" : "#4CAF50";
    toast.style.cssText = `position:fixed;background:${bg};color:white;padding:12px 20px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.4);z-index:100000;font-size:14px;font-family:sans-serif;opacity:0;transition:opacity 0.3s,transform 0.3s;transform:translateY(-20px);pointer-events:none;white-space:nowrap;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    const r = toast.getBoundingClientRect();
    let left, top;
    if (node && app?.canvas) {
        const cr = app.canvas.canvas.getBoundingClientRect();
        const s = app.canvas.ds.scale;
        const ox = app.canvas.ds.offset[0], oy = app.canvas.ds.offset[1];
        const nx = cr.left + (node.pos[0] + node.size[0] / 2 + ox) * s;
        const ny = cr.top + (node.pos[1] + node.size[1] / 2 + oy) * s;
        left = Math.max(10, Math.min(nx - r.width / 2, window.innerWidth - r.width - 10));
        top = Math.max(10, Math.min(ny - r.height / 2, window.innerHeight - r.height - 10));
    } else { left = window.innerWidth - r.width - 20; top = 20; }
    toast.style.left = left + "px"; toast.style.top = top + "px";
    void toast.offsetWidth;
    toast.style.opacity = "1"; toast.style.transform = "translateY(0)";
    setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateY(-20px)"; setTimeout(() => toast.remove(), 300); }, 3000);
}

app.registerExtension({
    name: "RSLoRAbatch.Widget",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "RSLoRAbatch") return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        const origOnConfigure = nodeType.prototype.onConfigure;
        const origOnSerialize = nodeType.prototype.onSerialize;
        const origOnRemoved = nodeType.prototype.onRemoved;

        const STATE_OFF = 0;
        const STATE_ARMED = 1;
        const STATE_RUNNING = 2;

        nodeType.prototype.onNodeCreated = function() {
            const result = origOnCreated ? origOnCreated.apply(this, arguments) : undefined;

            this.loraRows = [];
            this.loraOptions = [];
            this.loraTree = {};
            this.rowHeight = 30;
            this.clickZones = [];
            this.scrollOffset = 0;
            this.manual_size = false;
            this.isAutoResizing = false;
            this.MIN_WIDTH = 400;
            this.draggingIndex = null;
            this.dragCurrentY = null;
            this.isRestoring = false;
            this.storageKey = null;
            this.currentFilter = "";
            this.batchState = STATE_OFF;
            this.batchSnapshot = [];
            this.batchTotal = 0;
            this.batchRemaining = 0;

            const self = this;

            this.hiddenWidget = this.widgets.find(w => w.name === "lora_data");
            if (this.hiddenWidget) {
                this.hiddenWidget.hidden = true;
                if (this.hiddenWidget.element) this.hiddenWidget.element.style.display = "none";
                this.hiddenWidget.serializeValue = () => { self.syncData(); return self.hiddenWidget?.value ?? "[]"; };
            }

            const useClipWidget = this.widgets.find(w => w.name === "use_clip");
            if (useClipWidget) {
                useClipWidget.hidden = true;
                if (useClipWidget.element) useClipWidget.element.style.display = "none";
            }

            const updateClipInputState = () => {
                if (!useClipWidget) return;
                const idx = self.findInputSlot("clip");
                if (idx !== -1 && self.inputs?.[idx]) {
                    const en = useClipWidget.value;
                    self.inputs[idx].disabled = !en;
                    if (en) { delete self.inputs[idx].color; self.inputs[idx].tooltip = "CLIP enabled"; }
                    else { self.inputs[idx].color = "#555"; self.inputs[idx].tooltip = "CLIP disabled"; }
                }
            };

            this.setSize([this.MIN_WIDTH, this.size[1]]);

            const clipBtn = document.createElement("button");
            clipBtn.textContent = "CLIP ON";
            clipBtn.style.cssText = "width:100%;height:26px;padding:0;font-size:12px;border-radius:5px;cursor:pointer;margin:-6px 0 0 0;box-sizing:border-box;";
            this._clipBtnEl = clipBtn;

            const updateClipBtn = () => {
                const en = useClipWidget ? useClipWidget.value : true;
                const el = self._clipBtnEl;
                if (!el) return;
                if (en) {
                    el.textContent = "✅ CLIP ON (model and clip)";
                    el.style.border = "1px solid #4CAF50";
                    el.style.background = "#1a3a1a";
                    el.style.color = "#aaffaa";
                } else {
                    el.textContent = "❌ CLIP OFF (model only)";
                    el.style.border = "1px solid #00B0B0";
                    el.style.background = "#1E5986";
                    el.style.color = "#ffaaaa";
                }
            };

            clipBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (useClipWidget) {
                    useClipWidget.value = !useClipWidget.value;
                    if (useClipWidget.callback) useClipWidget.callback(useClipWidget.value);
                    updateClipBtn();
                    updateClipInputState();
                    self.graph?.setDirtyCanvas(true, true);
                }
            });

            const clipWidget = this.addDOMWidget("rs_clip_btn", "custom", clipBtn);
            clipWidget.computeSize = () => [this.width || 200, 30];

            const batchBtn = document.createElement("button");
            batchBtn.textContent = "⚙️ LoRA Batch";
            batchBtn.style.cssText = "width:100%;height:26px;padding:0;font-size:13px;border:1px solid #555;border-radius:5px;background:#2a2a2a;color:#ccc;cursor:pointer;margin:-14px 0 0 0;box-sizing:border-box;";
            this._batchBtnEl = batchBtn;

            batchBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (self.batchState === STATE_RUNNING) return;
                const active = self.loraRows.filter(r => r.enabled && r.name && r.name !== "None");
                if (!active.length) { showToast("LoRA is not selected", "error", self); return; }
                self.batchSnapshot = active.map(r => ({ ...r }));
                self.batchTotal = active.length;
                self.batchRemaining = active.length;
                self.batchState = STATE_ARMED;
                self.updateBatchBtn();
                self.graph?.setDirtyCanvas(true, true);
            });

            const batchWidget = this.addDOMWidget("rs_batch_btn", "custom", batchBtn);
            batchWidget.computeSize = () => [this.width || 200, 34];

            this.addWidget("button", "✔️ UPDATE LoRA LIST", "", async () => {
                await self.loadLoraList();
                self.graph?.setDirtyCanvas(true, true);
            });
            this.addWidget("button", "➕ ADD LoRA", "", () => {
                const w = self.widgets.find(x => x.name === "➕ ADD LoRA");
                self.showTreeSelector(w);
            });

            updateClipBtn();
            updateClipInputState();
            self.updateBatchBtn();

            const sendOne = async (loraCfg) => {
                await new Promise(r => setTimeout(r, 300));
                try {
                    const { output } = await app.graphToPrompt();
                    if (!output) throw new Error("No prompt output");
                    const nid = String(self.id);
                    const nodeOut = output[nid] || output[self.id];
                    if (!nodeOut) throw new Error(`Node ${nid} not found`);
                    nodeOut.inputs.lora_data = JSON.stringify([loraCfg]);
                    const cid = api.clientId || crypto.randomUUID();
                    const res = await api.fetchApi("/prompt", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ client_id: cid, prompt: output })
                    });
                    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
                    return true;
                } catch (err) { console.error("[RS Batch] Send error:", err); return false; }
            };

            const onBeforeQueue = async (ev) => {
                if (self.batchState !== STATE_ARMED) return;
                if (ev?.preventDefault) ev.preventDefault();
                self.batchState = STATE_RUNNING;
                self.updateBatchBtn();
                self.graph?.setDirtyCanvas(true, true);
                let sent = 0;
                for (const lora of self.batchSnapshot) {
                    if (await sendOne(lora)) sent++;
                    else showToast(`Failed LoRA ${sent + 1}`, "error", self);
                }
                if (sent === 0) { self.batchState = STATE_OFF; self.updateBatchBtn(); self.graph?.setDirtyCanvas(true, true); }
            };

            const qHandler = (e) => onBeforeQueue(e);
            document.addEventListener("comfy:queue:before", qHandler);
            const origQP = app.queuePrompt.bind(app);
            app.queuePrompt = async function(...args) {
                if (self.batchState === STATE_ARMED) { await onBeforeQueue(null); return; }
                return origQP(...args);
            };

            const onStatus = (data) => {
                if (self.batchState !== STATE_RUNNING) return;
                const detail = data?.detail || data || {};
                const qr = detail.queue_remaining ?? detail.status?.queue_remaining ?? detail.exec_info?.queue_remaining;
                if (qr === 0) {
                    self.batchState = STATE_OFF;
                    self.batchSnapshot = [];
                    self.updateBatchBtn();
                    self.graph?.setDirtyCanvas(true, true);
                }
            };
            api.addEventListener("status", onStatus);

            this._cleanup = () => {
                document.removeEventListener("comfy:queue:before", qHandler);
                api.removeEventListener("status", onStatus);
                app.queuePrompt = origQP;
            };

            this.wheelHandler = function(e) {
                if (app.canvas.node_over !== self) return;
                const gp = app.canvas.graph_mouse; if (!gp) return;
                const ry = gp[1] - self.pos[1];
                const sy = self.getListStartY();
                const avail = self.size[1] - sy - 10;
                const maxV = Math.max(1, Math.floor(avail / self.rowHeight));
                if (ry < sy || ry > sy + maxV * self.rowHeight) return;
                if (self.loraRows.length <= maxV) return;
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                const d = e.deltaY > 0 ? 1 : -1;
                const mx = self.loraRows.length - maxV;
                const nv = Math.max(0, Math.min(self.scrollOffset + d, mx));
                if (nv !== self.scrollOffset) { self.scrollOffset = nv; self.syncData(); self.graph.setDirtyCanvas(true, true); }
            };
            const ic = app.canvas.canvas;
            ic.addEventListener("wheel", this.wheelHandler, { capture: true, passive: false });
            this._wheelCanvas = ic;
            this._visHandler = () => {
                if (!document.hidden) setTimeout(() => {
                    const cc = app.canvas.canvas;
                    if (self._wheelCanvas && self._wheelCanvas !== cc) {
                        self._wheelCanvas.removeEventListener("wheel", self.wheelHandler, { capture: true, passive: false });
                        cc.addEventListener("wheel", self.wheelHandler, { capture: true, passive: false });
                        self._wheelCanvas = cc;
                    }
                }, 150);
            };
            document.addEventListener("visibilitychange", this._visHandler);

            const origResize = this.onResize;
            this.onResize = function(size) {
                if (size[0] < self.MIN_WIDTH) size[0] = self.MIN_WIDTH;
                const mh = self.getListStartY() + self.rowHeight + 10;
                if (size[1] < mh) size[1] = mh;
                if (!self.isAutoResizing) { self.manual_size = true; self.syncData(); }
                return origResize ? origResize.apply(this, arguments) : undefined;
            };

            setTimeout(() => {
                if (self.id) {
                    self.storageKey = `rs_lora_batch_${self.id}`;
                    self.loadLoraList().then(() => { self.restoreData(); self.safeAutoResize(); });
                }
            }, 100);

            return result;
        };

        nodeType.prototype.updateBatchBtn = function() {
            const el = this._batchBtnEl;
            if (!el) return;
            switch (this.batchState) {
                case STATE_ARMED:
                    el.textContent = `✅ BATCH: ${this.batchTotal} LoRAs`;
                    el.style.border = "1px solid #4CAF50";
                    el.style.background = "#1a3a1a";
                    el.style.color = "#aaffaa";
                    el.style.cursor = "pointer";
                    break;
                case STATE_RUNNING:
                    el.textContent = "⏳ Batch running...";
                    el.style.border = "1px solid #FF9800";
                    el.style.background = "#3a2a1a";
                    el.style.color = "#ffddaa";
                    el.style.cursor = "default";
                    break;
                default:
                    el.textContent = "⚙️ LoRA Batch";
                    el.style.border = "1px solid #555";
                    el.style.background = "#2a2a2a";
                    el.style.color = "#ccc";
                    el.style.cursor = "pointer";
            }
        };

        nodeType.prototype.getListStartY = function() {
            let y = 10;
            for (const w of this.widgets) {
                if (w.name === "➕ ADD LoRA") return y + (w.height || 30) + 8;
                y += w.computeSize ? w.computeSize()[1] + 4 : (w.height || 30) + 4;
            }
            return y + 8;
        };

        nodeType.prototype.safeAutoResize = function() {
            if (this.manual_size) return;
            const sy = this.getListStartY();
            const dv = Math.max(1, Math.min(this.loraRows.length, 10));
            const calc = sy + dv * this.rowHeight + 10;
            if (Math.abs(this.size[1] - calc) > 1) {
                this.isAutoResizing = true;
                this.setSize([this.size[0], calc]);
                this.isAutoResizing = false;
                this.graph?.setDirtyCanvas(true, true);
            }
        };

        nodeType.prototype.resetBatch = function() {
            if (this.batchState === STATE_ARMED) {
                this.batchState = STATE_OFF;
                this.batchSnapshot = [];
                this.batchTotal = 0;
                this.batchRemaining = 0;
                this.updateBatchBtn();
                this.graph?.setDirtyCanvas(true, true);
            }
        };

        nodeType.prototype.syncData = function() {
            if (this.isRestoring) return;
            const json = JSON.stringify(this.loraRows);
            if (this.hiddenWidget) this.hiddenWidget.value = json;
            if (!this.properties) this.properties = {};
            this.properties["lora_rows"] = json;
            this.properties["manual_size"] = this.manual_size;
            this.properties["scrollOffset"] = this.scrollOffset;
            if (this.storageKey) {
                try { localStorage.setItem(this.storageKey, JSON.stringify({ loraRows: this.loraRows, ts: Date.now() })); } catch(e){}
            }
        };

        nodeType.prototype.updateUI = function() { this.syncData(); this.graph?.setDirtyCanvas(true, true); };

        nodeType.prototype.loadLoraList = async function() {
            try {
                const res = await api.fetchApi("/rayko_lora_loader/get_loras");
                const data = await res.json();
                this.loraOptions = data.filter(l => l && l !== "None");
                this.loraTree = buildTree(this.loraOptions);
            } catch(e) { this.loraOptions = []; this.loraTree = {}; }
        };

        nodeType.prototype.onConfigure = function(info) {
            this.isRestoring = true;
            this.batchState = STATE_OFF;
            if (info.properties?.["lora_rows"]) { try { const s = JSON.parse(info.properties["lora_rows"]); if (Array.isArray(s)) this.loraRows = s; } catch(e){} }
            if (info.properties?.["manual_size"] !== undefined) this.manual_size = info.properties["manual_size"];
            if (info.properties?.["scrollOffset"] !== undefined) this.scrollOffset = info.properties["scrollOffset"];
            if (info.widgets_values && Array.isArray(info.widgets_values)) {
                for (const v of info.widgets_values) {
                    if (v && typeof v === "string" && v.startsWith("[")) {
                        try { const s = JSON.parse(v); if (Array.isArray(s) && s.length) { this.loraRows = s; break; } } catch(e){}
                    }
                }
            }
            this.isRestoring = false;
            const self = this;
            this.loadLoraList().then(() => { self.updateUI(); requestAnimationFrame(() => self.safeAutoResize()); });
            return origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;
        };

        nodeType.prototype.onSerialize = function(o) {
            this.syncData();
            if (!o.properties) o.properties = {};
            o.properties["lora_rows"] = this.properties["lora_rows"];
            o.properties["manual_size"] = this.manual_size;
            o.properties["scrollOffset"] = this.scrollOffset;
            return origOnSerialize ? origOnSerialize.apply(this, arguments) : undefined;
        };

        nodeType.prototype.onRemoved = function() {
            if (this.storageKey) localStorage.removeItem(this.storageKey);
            if (this.wheelHandler && this._wheelCanvas) this._wheelCanvas.removeEventListener("wheel", this.wheelHandler, { capture: true, passive: false });
            document.removeEventListener("visibilitychange", this._visHandler);
            if (this._cleanup) this._cleanup();
            return origOnRemoved ? origOnRemoved.apply(this, arguments) : undefined;
        };

        nodeType.prototype.restoreData = function() {
            if (this.isRestoring) return;
            let saved = null;
            if (this.properties?.["lora_rows"]) { try { saved = JSON.parse(this.properties["lora_rows"]); if (Array.isArray(saved) && saved.length) { this.loraRows = saved; return; } } catch(e){} }
            if (!saved && this.hiddenWidget?.value) { try { const v = JSON.parse(this.hiddenWidget.value); if (Array.isArray(v) && v.length) { this.loraRows = v; return; } } catch(e){} }
            if (!saved && this.storageKey) { try { const s = localStorage.getItem(this.storageKey); if (s) { const d = JSON.parse(s); if (Date.now() - d.ts < 86400000 && Array.isArray(d.loraRows)) saved = d.loraRows; } } catch(e){} }
            if (saved) this.loraRows = saved;
        };

        nodeType.prototype.addRow = function(name) {
            this.resetBatch();
            this.loraRows.push({ name, strength_model: 1.0, strength_clip: 1.0, enabled: true });
            this.scrollOffset = 0; this.manual_size = false;
            this.syncData();
            this.safeAutoResize();
        };

        nodeType.prototype.showStrengthEditor = function(rowIndex, localX, localY) {
            const old = document.getElementById("rs-strength-editor");
            if (old) old.remove();

            const row = this.loraRows[rowIndex];
            if (!row) return;

            const self = this;
            const currentVal = row.strength_model;

            const cr = app.canvas.canvas.getBoundingClientRect();
            const ds = app.canvas.ds;
            const screenX = cr.left + (this.pos[0] + localX + ds.offset[0]) * ds.scale;
            const screenY = cr.top + (this.pos[1] + localY + ds.offset[1]) * ds.scale;

            const editor = document.createElement("div");
            editor.id = "rs-strength-editor";
            editor.style.cssText = "position:fixed;z-index:100001;background:#1a1a1a;border:1px solid #4CAF50;border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px;box-shadow:0 4px 15px rgba(0,0,0,0.8);";
            editor.style.left = (screenX - 60) + "px";
            editor.style.top = (screenY - 45) + "px";

            const input = document.createElement("input");
            input.type = "text";
            input.value = currentVal.toFixed(2);
            input.style.cssText = "width:120px;padding:6px 8px;background:#111;color:#fff;border:1px solid #555;border-radius:4px;font-size:13px;font-family:monospace;text-align:center;outline:none;box-sizing:border-box;";

            const btnRow = document.createElement("div");
            btnRow.style.cssText = "display:flex;gap:4px;";

            const okBtn = document.createElement("button");
            okBtn.textContent = "OK";
            okBtn.style.cssText = "flex:1;padding:4px;background:#1a3a1a;color:#4CAF50;border:1px solid #4CAF50;border-radius:4px;cursor:pointer;font-size:12px;";
            okBtn.onmouseenter = () => okBtn.style.background = "#2a4a2a";
            okBtn.onmouseleave = () => okBtn.style.background = "#1a3a1a";

            const cancelBtn = document.createElement("button");
            cancelBtn.textContent = "✕";
            cancelBtn.style.cssText = "padding:4px 8px;background:#2a2a2a;color:#ccc;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:12px;";
            cancelBtn.onmouseenter = () => cancelBtn.style.background = "#3a3a3a";
            cancelBtn.onmouseleave = () => cancelBtn.style.background = "#2a2a2a";

            btnRow.append(okBtn, cancelBtn);
            editor.append(input, btnRow);
            document.body.appendChild(editor);

            requestAnimationFrame(() => {
                const r = editor.getBoundingClientRect();
                if (r.right > window.innerWidth - 10) editor.style.left = (window.innerWidth - r.width - 10) + "px";
                if (r.bottom > window.innerHeight - 10) editor.style.top = (screenY - r.height - 10) + "px";
                if (r.left < 10) editor.style.left = "10px";
                if (r.top < 10) editor.style.top = "10px";
            });

            setTimeout(() => { input.focus(); input.select(); }, 50);

            const apply = () => {
                const val = parseFloat(input.value.replace(",", "."));
                if (!isNaN(val) && val >= -10 && val <= 10) {
                    self.resetBatch();
                    self.loraRows[rowIndex].strength_model = val;
                    self.syncData();
                    self.graph?.setDirtyCanvas(true, true);
                }
                close();
            };

            const close = () => {
                editor.remove();
                document.removeEventListener("pointerdown", onOutside, true);
                document.removeEventListener("keydown", onKey, true);
            };

            const onKey = (e) => {
                if (e.key === "Enter") { e.preventDefault(); apply(); }
                if (e.key === "Escape") { e.preventDefault(); close(); }
            };

            const onOutside = (e) => {
                if (!editor.contains(e.target)) close();
            };

            okBtn.addEventListener("click", (e) => { e.stopPropagation(); apply(); });
            cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); close(); });
            input.addEventListener("keydown", onKey);
            document.addEventListener("keydown", onKey, true);
            setTimeout(() => document.addEventListener("pointerdown", onOutside, true), 50);
        };

        nodeType.prototype.onDrawForeground = function(ctx) {
            if (!this.manual_size) {
                const sy = this.getListStartY();
                const dv = Math.max(1, Math.min(this.loraRows.length, 10));
                const mr = sy + dv * this.rowHeight + 10;
                if (this.size[1] < mr) { this.isAutoResizing = true; this.setSize([this.size[0], mr]); this.isAutoResizing = false; }
            }
            if (!this.loraRows.length) return;
            this.clickZones = [];
            const startY = this.getListStartY();
            const pad = 10, rpw = 145;
            const avail = this.size[1] - startY - 10;
            const maxV = Math.max(1, Math.floor(avail / this.rowHeight));
            const maxOff = Math.max(0, this.loraRows.length - maxV);
            if (this.scrollOffset > maxOff) this.scrollOffset = maxOff;
            const vs = this.scrollOffset, ve = Math.min(vs + maxV, this.loraRows.length);

            for (let i = 0; i < ve - vs; i++) {
                const di = vs + i, row = this.loraRows[di];
                if (this.draggingIndex === di) continue;
                const y = startY + i * this.rowHeight, h = this.rowHeight - 2, ty = y + h / 2;
                ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)";
                ctx.fillRect(pad, y, this.size[0] - pad * 2, h);

                this.clickZones.push({ type: "drag", index: di, x: pad, y, w: 20, h });
                ctx.fillStyle = "#888"; ctx.font = "14px sans-serif"; ctx.fillText("⋮⋮", pad + 2, ty + 5);

                const tx = pad + 20;
                ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                ctx.beginPath(); ctx.arc(tx + 8, ty, 7, 0, Math.PI * 2); ctx.fill();
                this.clickZones.push({ type: "toggle", index: di, x: tx, y, w: 24, h });

                const nx = tx + 20, nw = this.size[0] - pad * 2 - 10 - rpw - 25;
                ctx.fillStyle = row.enabled ? "#fff" : "#777"; ctx.font = "12px sans-serif";
                let dn = row.name;
                if (ctx.measureText(dn).width > nw) { while (ctx.measureText(dn + "...").width > nw && dn.length) dn = dn.slice(0, -1); dn += "..."; }
                ctx.fillText(dn, nx, ty + 4);
                this.clickZones.push({ type: "name", index: di, x: nx, y, w: nw, h });

                const alx = this.size[0] - rpw + 10;
                ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                ctx.beginPath(); ctx.moveTo(alx + 18, y + 8); ctx.lineTo(alx + 8, ty); ctx.lineTo(alx + 18, y + 22); ctx.fill();
                this.clickZones.push({ type: "left", index: di, x: alx, y, w: 28, h });

                const sx = alx + 25, sw = 50;
                ctx.fillStyle = "#222"; ctx.fillRect(sx, y + 5, sw, h - 10);
                ctx.strokeStyle = row.enabled ? "#4CAF50" : "#555"; ctx.strokeRect(sx, y + 5, sw, h - 10);
                ctx.fillStyle = row.enabled ? "#fff" : "#777"; ctx.textAlign = "center";
                ctx.fillText(row.strength_model.toFixed(2), sx + sw / 2, ty + 4); ctx.textAlign = "left";
                this.clickZones.push({ type: "str", index: di, x: sx, y, w: sw, h });

                const arx = sx + sw + 5;
                ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                ctx.beginPath(); ctx.moveTo(arx + 2, y + 8); ctx.lineTo(arx + 12, ty); ctx.lineTo(arx + 2, y + 22); ctx.fill();
                this.clickZones.push({ type: "right", index: di, x: arx, y, w: 18, h });

                const dx = arx + 22;
                ctx.fillStyle = "#f44336"; ctx.fillText("❌", dx, ty + 4);
                this.clickZones.push({ type: "delete", index: di, x: dx, y, w: 30, h });
            }

            if (this.draggingIndex !== null && this.dragCurrentY !== null) {
                const row = this.loraRows[this.draggingIndex];
                const h = this.rowHeight - 2, y = this.dragCurrentY - h / 2, ty = y + h / 2;
                ctx.globalAlpha = 0.8; ctx.fillStyle = "#3a5a3a";
                ctx.fillRect(pad, y, this.size[0] - pad * 2, h);
                ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.fillText("⋮⋮", pad + 2, ty + 5);
                ctx.font = "12px sans-serif"; ctx.fillText(row.name, pad + 25, ty + 4);
                ctx.globalAlpha = 1;
                let ti = Math.floor((this.dragCurrentY - startY) / this.rowHeight) + this.scrollOffset;
                ti = Math.max(0, Math.min(ti, this.loraRows.length - 1));
                if (ti !== this.draggingIndex) {
                    const tgy = startY + (ti - this.scrollOffset) * this.rowHeight;
                    ctx.strokeStyle = "#4CAF50"; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(pad, tgy); ctx.lineTo(this.size[0] - pad, tgy); ctx.stroke(); ctx.lineWidth = 1;
                }
            }

            if (this.loraRows.length > maxV) {
                if (this.scrollOffset > 0) {
                    ctx.fillStyle = "rgba(255,215,0,0.6)"; ctx.beginPath();
                    ctx.moveTo(this.size[0]/2-8, startY-2); ctx.lineTo(this.size[0]/2+8, startY-2); ctx.lineTo(this.size[0]/2, startY-10);
                    ctx.closePath(); ctx.fill();
                }
                if (ve < this.loraRows.length) {
                    const iy = startY + (ve - vs) * this.rowHeight + 2;
                    ctx.fillStyle = "rgba(255,215,0,0.6)"; ctx.beginPath();
                    ctx.moveTo(this.size[0]/2-8, iy); ctx.lineTo(this.size[0]/2+8, iy); ctx.lineTo(this.size[0]/2, iy+8);
                    ctx.closePath(); ctx.fill();
                }
            }
        };

        nodeType.prototype.onMouseDown = function(e, pos) {
            if (!this.clickZones?.length) return false;
            for (const z of this.clickZones) {
                if (pos[0] >= z.x && pos[0] <= z.x + z.w && pos[1] >= z.y && pos[1] <= z.y + z.h) {
                    if (z.type === "drag") { this.draggingIndex = z.index; this.dragCurrentY = pos[1]; this.graph?.setDirtyCanvas(true, true); return true; }
                    if (z.type === "toggle") { this.resetBatch(); this.loraRows[z.index].enabled = !this.loraRows[z.index].enabled; this.syncData(); this.graph?.setDirtyCanvas(true, true); return true; }
                    if (z.type === "str") {
                        this.showStrengthEditor(z.index, z.x + z.w / 2, z.y + z.h / 2);
                        return true;
                    }
                    if (z.type === "left") { this.resetBatch(); this.loraRows[z.index].strength_model = Math.max(-10, Math.round((this.loraRows[z.index].strength_model - 0.05) * 20) / 20); this.syncData(); this.graph?.setDirtyCanvas(true, true); return true; }
                    if (z.type === "right") { this.resetBatch(); this.loraRows[z.index].strength_model = Math.min(10, Math.round((this.loraRows[z.index].strength_model + 0.05) * 20) / 20); this.syncData(); this.graph?.setDirtyCanvas(true, true); return true; }
                    if (z.type === "delete") { this.resetBatch(); this.loraRows.splice(z.index, 1); this.scrollOffset = 0; this.manual_size = false; this.syncData(); requestAnimationFrame(() => this.safeAutoResize()); return true; }
                }
            }
            return false;
        };
        nodeType.prototype.onMouseMove = function(e, pos) { if (this.draggingIndex !== null) { this.dragCurrentY = pos[1]; this.graph?.setDirtyCanvas(true, true); return true; } return false; };
        nodeType.prototype.onMouseUp = function() {
            if (this.draggingIndex !== null) {
                const sy = this.getListStartY();
                let ti = Math.floor((this.dragCurrentY - sy) / this.rowHeight) + this.scrollOffset;
                ti = Math.max(0, Math.min(ti, this.loraRows.length - 1));
                if (ti !== this.draggingIndex) { const item = this.loraRows.splice(this.draggingIndex, 1)[0]; this.loraRows.splice(ti, 0, item); this.resetBatch(); this.syncData(); this.updateUI(); }
                this.draggingIndex = null; this.dragCurrentY = null; this.graph?.setDirtyCanvas(true, true); return true;
            }
            return false;
        };

        nodeType.prototype.showTreeSelector = function(widget) {
            const self = this;
            const expanded = {};
            this.currentFilter = "";
            const mw = 450, mh = 600;
            let ml = 100, mt = 100;
            if (widget && app?.canvas) {
                const r = app.canvas.canvas.getBoundingClientRect();
                const s = app.canvas.ds.scale, ox = app.canvas.ds.offset[0], oy = app.canvas.ds.offset[1];
                let cl = r.left + ((this.pos[0] + this.size[0]) * s) + ox + 10;
                const ct = r.top + ((this.pos[1] + widget.y) * s) + oy;
                if (cl + mw > window.innerWidth) cl = r.left + (this.pos[0] * s) + ox - mw - 10;
                if (cl < 10) cl = 10;
                mt = Math.max(10, Math.min(ct, window.innerHeight - mh - 10));
                ml = cl;
            }
            const old = document.getElementById("rs-lora-batch-tree-menu");
            if (old) old.remove();
            const menu = document.createElement("div");
            menu.id = "rs-lora-batch-tree-menu";
            menu.style.cssText = `position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:6px;height:${mh}px;width:${mw}px;overflow-y:auto;overflow-x:hidden;z-index:10000;left:${ml}px;top:${mt}px;box-shadow:0 4px 20px rgba(0,0,0,0.8);display:flex;flex-direction:column;`;
            const hc = document.createElement("div");
            hc.style.cssText = "padding:10px;background:#252525;border-bottom:1px solid #333;display:flex;flex-direction:column;gap:8px;flex-shrink:0;";
            const title = document.createElement("div"); title.textContent = " Search & Select LoRA"; title.style.cssText = "color:#fff;font-weight:bold;font-size:14px;";
            const si = document.createElement("input"); si.type = "text"; si.placeholder = "Type to search...";
            si.style.cssText = "width:100%;padding:8px;background:#333;border:1px solid #555;color:#fff;border-radius:4px;outline:none;font-size:13px;box-sizing:border-box;";
            si.autofocus = true;
            hc.append(title, si); menu.appendChild(hc);
            const lc = document.createElement("div"); lc.style.cssText = "padding:5px 0;overflow-y:auto;flex-grow:1;"; menu.appendChild(lc);
            const isAdded = (n) => self.loraRows.some(r => r.name === n);

            const render = (filter = "") => {
                lc.innerHTML = "";
                const lf = filter.trim().toLowerCase();
                self.currentFilter = filter;
                if (!filter || "none".includes(lf)) {
                    const a = isAdded("None");
                    const ni = document.createElement("div");
                    ni.textContent = (a ? "✓ " : "") + "None";
                    ni.style.cssText = `padding:10px 12px;cursor:pointer;color:${a?'#4CAF50':'#aaa'};border-bottom:1px solid #333;background:#2a2a2a;font-style:italic;`;
                    ni.onmouseenter = () => ni.style.background = "#3a3a3a";
                    ni.onmouseleave = () => ni.style.background = "#2a2a2a";
ni.onclick = (e) => { e.stopPropagation(); self.addRow("None"); self.graph?.setDirtyCanvas(true, true); render(filter); };
                    lc.appendChild(ni);
                }
                if (!Object.keys(self.loraTree).length) {
                    if (!filter) { const em = document.createElement("div"); em.textContent = " Empty (Click UPDATE)"; em.style.cssText = "padding:20px;color:#f44336;text-align:center;"; lc.appendChild(em); }
                    return;
                }
                if (lf.length > 0) {
                    const all = getAllPaths(self.loraTree).filter(p => !p.isFolder && p.path.toLowerCase().includes(lf));
                    if (!all.length) { const nr = document.createElement("div"); nr.textContent = `No results for "${filter}"`; nr.style.cssText = "padding:15px;color:#777;text-align:center;font-style:italic;"; lc.appendChild(nr); }
                    else all.forEach(it => {
                        const a = isAdded(it.path);
                        const el = document.createElement("div");
                        el.textContent = (a ? "✓ " : " ") + it.path;
                        el.style.cssText = `padding:8px 12px;cursor:pointer;color:${a?'#4CAF50':'#ddd'};font-size:12px;border-bottom:1px solid #2a2a2a;`;
                        el.onmouseenter = () => el.style.background = "#333";
                        el.onmouseleave = () => el.style.background = "transparent";
el.onclick = (e) => { e.stopPropagation(); self.addRow(it.path); self.graph?.setDirtyCanvas(true, true); render(filter); };
                        lc.appendChild(el);
                    });
                } else { renderTree("", self.loraTree, 0, lc, expanded, self, render); }
            };

            render("");
            let tid = null;
            si.addEventListener("input", (e) => { if (tid) clearTimeout(tid); tid = setTimeout(() => render(e.target.value), 50); });
            document.body.appendChild(menu);
            setTimeout(() => si.focus(), 50);
            let ct2 = null;
            const close = () => { if (menu.parentNode) menu.remove(); document.removeEventListener("pointerdown", hoc, true); document.removeEventListener("keydown", hek, true); if (ct2) { clearTimeout(ct2); ct2 = null; } };
            const hek = (ev) => { if (ev.key === "Escape") close(); };
            const hoc = (ev) => { if (menu.contains(ev.target)) { if (ct2) { clearTimeout(ct2); ct2 = null; } return; } close(); };
            menu.addEventListener("mouseleave", () => { ct2 = setTimeout(close, 300); });
            menu.addEventListener("mouseenter", () => { if (ct2) { clearTimeout(ct2); ct2 = null; } });
            setTimeout(() => { document.addEventListener("pointerdown", hoc, true); document.addEventListener("keydown", hek, true); }, 50);
        };
    }
});

function buildTree(list) {
    const tree = {};
    for (const l of list) {
        if (!l || l === "None") continue;
        const parts = l.replace(/\\/g, "/").split("/");
        let cur = tree;
        for (let i = 0; i < parts.length; i++) { const p = parts[i], last = i === parts.length - 1; if (!cur[p]) cur[p] = last ? null : {}; if (!last) cur = cur[p]; }
    }
    return tree;
}
function getAllPaths(tree, cp = "") {
    let paths = [];
    for (const n in tree) { const st = tree[n], fp = cp ? `${cp}/${n}` : n, isF = st !== null; paths.push({ path: fp, isFolder: isF }); if (isF) paths = paths.concat(getAllPaths(st, fp)); }
    return paths;
}
function renderTree(path, tree, level, container, expanded, self, renderFn) {
    const keys = Object.keys(tree).sort((a, b) => { const af = tree[a] !== null, bf = tree[b] !== null; if (af && !bf) return -1; if (!af && bf) return 1; return a.toLowerCase().localeCompare(b.toLowerCase()); });
    const isAdded = (n) => self.loraRows.some(r => r.name === n);
    for (const name of keys) {
        const sub = tree[name], isFolder = sub !== null, ip = path ? `${path}/${name}` : name;
        if (isFolder) {
            const fh = document.createElement("div");
            fh.style.cssText = `padding:8px 12px;cursor:pointer;color:#ffd700;font-size:13px;background:#252525;display:flex;align-items:center;padding-left:${12 + level * 16}px;`;
            fh.innerHTML = `<span style="margin-right:8px;">${expanded[ip] ? "▼" : "▶"}</span>  ${name}`;
            fh.onclick = (e) => { e.stopPropagation(); expanded[ip] = !expanded[ip]; container.innerHTML = ""; renderTree("", self.loraTree, 0, container, expanded, self, renderFn); };
            container.appendChild(fh);
            if (expanded[ip]) renderTree(ip, sub, level + 1, container, expanded, self, renderFn);
        } else {
            const a = isAdded(ip);
            const fi = document.createElement("div");
            fi.textContent = (a ? "✓ " : " ") + name;
            fi.style.cssText = `padding:8px 12px;cursor:pointer;color:${a?'#4CAF50':'#ddd'};font-size:12px;padding-left:${12 + level * 16}px;`;
            fi.onmouseenter = () => fi.style.background = "#333";
            fi.onmouseleave = () => fi.style.background = "transparent";
            fi.onclick = (e) => { e.stopPropagation(); self.addRow(ip); self.graph?.setDirtyCanvas(true, true); renderFn(self.currentFilter); };
            container.appendChild(fi);
        }
    }
}