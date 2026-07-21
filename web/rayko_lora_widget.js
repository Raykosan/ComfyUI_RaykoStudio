import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RaykoLoraWidget",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RaykoModelsLoader") {
            const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
            const originalOnConfigure = nodeType.prototype.onConfigure;
            const originalOnSerialize = nodeType.prototype.onSerialize;
            const originalOnRemoved = nodeType.prototype.onRemoved;
            
            nodeType.prototype.onNodeCreated = function() {
                const result = originalOnNodeCreated ? originalOnNodeCreated.apply(this, arguments) : undefined;
                this.loraRows = [];
                this.loraOptions = [];
                this.loraTree = {};
                this.targetWidth = 400;
                this.rowHeight = 30;
                this.clickZones = [];
                this.storageKey = null;
                this.isRestoring = false;
                this.isInitialized = false;
                this.manual_size = false;
                this.isAutoResizing = false;
                this.MIN_WIDTH = 400;
                this.scrollOffset = 0;
                this.oldWheelCanvas = null;
                this.oldWheelHandler = null;
                this.currentFilter = "";
                
                this.hiddenWidget = this.widgets.find(w => w.name === "lora_data");
                const nodeRef = this;
                
                if (this.hiddenWidget) {
                    this.hiddenWidget.hidden = true;
                    const originalSerializeValue = this.hiddenWidget.serializeValue;
                    this.hiddenWidget.serializeValue = function() {
                        nodeRef.syncData();
                        const val = nodeRef.hiddenWidget ? nodeRef.hiddenWidget.value : "[]";
                        return (val !== undefined && val !== null) ? val : "[]";
                    };
                }

                const useClip2Widget = this.widgets.find(w => w.name === "use_clip2");
                const clipName2Widget = this.widgets.find(w => w.name === "clip_name2");
                
                if (useClip2Widget && clipName2Widget) {
                    clipName2Widget.disabled = !useClip2Widget.value;
                    if (clipName2Widget.element) {
                        clipName2Widget.element.classList.toggle("comfy-disabled", clipName2Widget.disabled);
                    }
                    const originalCallback = useClip2Widget.callback;
                    useClip2Widget.callback = function(value) {
                        if (originalCallback) originalCallback(value);
                        clipName2Widget.disabled = !value;
                        if (clipName2Widget.element) {
                            clipName2Widget.element.classList.toggle("comfy-disabled", clipName2Widget.disabled);
                        }
                        nodeRef.graph?.setDirtyCanvas(true, true);
                    };
                }

                this.setSize([this.targetWidth, this.size[1]]);

                const collectPresetData = () => ({
                    unet_name: this.widgets.find(w => w.name === "unet_name")?.value || "",
                    weight_dtype: this.widgets.find(w => w.name === "weight_dtype")?.value || "default",
                    use_clip2: this.widgets.find(w => w.name === "use_clip2")?.value || false,
                    clip_name: this.widgets.find(w => w.name === "clip_name")?.value || "",
                    clip_name2: this.widgets.find(w => w.name === "clip_name2")?.value || "",
                    clip_type: this.widgets.find(w => w.name === "clip_type")?.value || "stable_diffusion",
                    clip_device: this.widgets.find(w => w.name === "clip_device")?.value || "default",
                    vae_name: this.widgets.find(w => w.name === "vae_name")?.value || ""
                });

                const applyPresetData = (data) => {
                    const setWidgetValue = (name, value) => {
                        const widget = this.widgets.find(w => w.name === name);
                        if (widget) {
                            widget.value = value;
                            if (widget.callback) widget.callback(value);
                        }
                    };
                    ["unet_name", "weight_dtype", "use_clip2", "clip_name", "clip_name2", "clip_type", "clip_device", "vae_name"].forEach(k => setWidgetValue(k, data[k]));
                    this.loraRows = [];
                    this.scrollOffset = 0;
                    this.manual_size = false;
                    this.syncData();
                    
                    requestAnimationFrame(() => {
                        const startY = this.getLoraListStartY();
                        const calculatedHeight = startY + this.rowHeight + 10;
                        this.isAutoResizing = true;
                        this.setSize([this.size[0], calculatedHeight]);
                        this.isAutoResizing = false;
                        if (this.graph) {
                            this.graph.setDirtyCanvas(true, true);
                            setTimeout(() => this.graph.setDirtyCanvas(true, true), 50);
                            setTimeout(() => this.graph.setDirtyCanvas(true, true), 100);
                            setTimeout(() => this.graph.setDirtyCanvas(true, true), 150);
                        }
                    });
                };

                const collectLoraPresetData = () => ({
                    lora_rows: this.loraRows.map(row => ({
                        name: row.name,
                        strength_model: row.strength_model,
                        strength_clip: row.strength_clip,
                        enabled: row.enabled
                    }))
                });

                const applyLoraPresetData = (data) => {
                    this.loraRows = (data.lora_rows || []).map(row => ({
                        name: row.name || "",
                        strength_model: parseFloat(row.strength_model) || 1.0,
                        strength_clip: parseFloat(row.strength_clip) || 1.0,
                        enabled: row.enabled !== undefined ? row.enabled : true
                    }));
                    this.scrollOffset = 0;
                    this.manual_size = false;
                    this.syncData();
                    
                    requestAnimationFrame(() => {
                        const startY = this.getLoraListStartY();
                        const desiredVisible = Math.max(1, Math.min(this.loraRows.length, 10));
                        const calculatedHeight = startY + (desiredVisible * this.rowHeight) + 10;
                        this.isAutoResizing = true;
                        this.setSize([this.size[0], calculatedHeight]);
                        this.isAutoResizing = false;
                        if (this.graph) {
                            this.graph.setDirtyCanvas(true, true);
                            setTimeout(() => this.graph.setDirtyCanvas(true, true), 50);
                            setTimeout(() => this.graph.setDirtyCanvas(true, true), 100);
                            setTimeout(() => this.graph.setDirtyCanvas(true, true), 150);
                        }
                    });
                };

                const presetListOverlay = document.createElement("div");
                presetListOverlay.style.cssText = "position:fixed;display:none;flex-direction:column;max-height:300px;overflow-y:auto;background:#2a2a2a;border:1px solid #5090cc;border-radius:6px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.8);min-width:250px;padding:5px;";
                document.body.appendChild(presetListOverlay);
                
                const presetNameInput = document.createElement("div");
                presetNameInput.style.cssText = "position:fixed;display:none;background:#2a2a2a;padding:10px;border:1px solid #5090cc;border-radius:6px;z-index:10000;box-shadow:0 4px 15px rgba(0,0,0,0.7);width:220px;text-align:center;";
                
                const inputLabel = document.createElement("div");
                inputLabel.style.cssText = "color:#999;font-size:11px;margin-bottom:4px;text-align:left;";
                inputLabel.textContent = "Preset name:";
                
                const inputField = document.createElement("input");
                inputField.style.cssText = "width:100%;padding:5px;background:#111;color:#fff;border:1px solid #444;border-radius:3px;margin-bottom:5px;font-size:12px;box-sizing:border-box;";
                
                const inputBtns = document.createElement("div");
                inputBtns.style.cssText = "display:flex;gap:5px;";
                
                const inputOk = document.createElement("button");
                inputOk.style.cssText = "flex:1;padding:4px;background:#1a3a5a;color:#aadaff;border:1px solid #5090cc;border-radius:3px;cursor:pointer;font-size:11px;";
                inputOk.textContent = "OK";
                
                const inputCancel = document.createElement("button");
                inputCancel.style.cssText = "flex:1;padding:4px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:3px;cursor:pointer;font-size:11px;";
                inputCancel.textContent = "Cancel";
                
                inputBtns.append(inputOk, inputCancel);
                presetNameInput.append(inputLabel, inputField, inputBtns);
                document.body.appendChild(presetNameInput);

                const deleteConfirmOverlay = document.createElement("div");
                deleteConfirmOverlay.style.cssText = "position:fixed;display:none;background:#2a2a2a;padding:10px;border:1px solid #5090cc;border-radius:6px;z-index:10000;box-shadow:0 4px 15px rgba(0,0,0,0.7);width:220px;text-align:center;";
                
                const deleteText = document.createElement("div");
                deleteText.style.cssText = "color:#ccc;font-size:12px;margin-bottom:10px;word-break:break-word;";
                
                const deleteBtns = document.createElement("div");
                deleteBtns.style.cssText = "display:flex;gap:5px;";
                
                const deleteOk = document.createElement("button");
                deleteOk.style.cssText = "flex:1;padding:4px;background:#1a3a5a;color:#aadaff;border:1px solid #5090cc;border-radius:3px;cursor:pointer;font-size:11px;";
                deleteOk.textContent = "OK";
                
                const deleteCancel = document.createElement("button");
                deleteCancel.style.cssText = "flex:1;padding:4px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:3px;cursor:pointer;font-size:11px;";
                deleteCancel.textContent = "Cancel";
                
                deleteBtns.append(deleteOk, deleteCancel);
                deleteConfirmOverlay.append(deleteText, deleteBtns);
                document.body.appendChild(deleteConfirmOverlay);

                let pendingSaveType = "model";
                let pendingSelectType = "model";
                let pendingDeleteType = "model";
                let pendingDeleteName = null;

                const presetsWrapper = document.createElement("div");
                presetsWrapper.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;margin:0;padding:0;box-sizing:border-box;";

                const presetsRoot = document.createElement("div");
                presetsRoot.style.cssText = "display:flex;gap:4px;width:100%;align-items:center;height:30px;";
                
                const savePresetBtn = document.createElement("button");
                savePresetBtn.textContent = " 💾 Save models preset";
                savePresetBtn.style.cssText = "flex:1;padding:4px 2px;font-size:11px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;height:26px;margin:0;";
                
                const selectPresetBtn = document.createElement("button");
                selectPresetBtn.textContent = " 📂 Select models preset";
                selectPresetBtn.style.cssText = "flex:1;padding:4px 2px;font-size:11px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;height:26px;margin:0;";
                presetsRoot.append(savePresetBtn, selectPresetBtn);

                const loraPresetsRoot = document.createElement("div");
                loraPresetsRoot.style.cssText = "display:flex;gap:4px;width:100%;align-items:center;height:30px;";
                
                const saveLoraPresetBtn = document.createElement("button");
                saveLoraPresetBtn.textContent = " 💾 Save LoRA preset";
                saveLoraPresetBtn.style.cssText = "flex:1;padding:4px 2px;font-size:11px;border:1px solid #50cc90;border-radius:5px;background:#1a3a2a;color:#aaffcc;cursor:pointer;height:26px;margin:0;";
                
                const selectLoraPresetBtn = document.createElement("button");
                selectLoraPresetBtn.textContent = " 📂 Select LoRA preset";
                selectLoraPresetBtn.style.cssText = "flex:1;padding:4px 2px;font-size:11px;border:1px solid #50cc90;border-radius:5px;background:#1a3a2a;color:#aaffcc;cursor:pointer;height:26px;margin:0;";
                loraPresetsRoot.append(saveLoraPresetBtn, selectLoraPresetBtn);
                
                presetsWrapper.append(presetsRoot, loraPresetsRoot);

                const presetsWidget = this.addDOMWidget("presets_ui", "custom", presetsWrapper);
                presetsWidget.computeSize = function() { return [this.width || 130, 70]; };

                const openSaveDialog = (type, btnElement) => {
                    presetListOverlay.style.display = "none";
                    deleteConfirmOverlay.style.display = "none";
                    pendingSaveType = type;
                    const rect = btnElement.getBoundingClientRect();
                    presetNameInput.style.left = rect.left + "px";
                    presetNameInput.style.top = (rect.bottom + 5) + "px";
                    presetNameInput.style.display = "block";
                    inputField.value = "";
                    setTimeout(() => inputField.focus(), 50);
                };

                savePresetBtn.addEventListener("click", (e) => { e.stopPropagation(); openSaveDialog("model", savePresetBtn); });
                saveLoraPresetBtn.addEventListener("click", (e) => { e.stopPropagation(); openSaveDialog("lora", saveLoraPresetBtn); });

                const performSave = () => {
                    const name = inputField.value.trim();
                    if (!name) return;
                    presetNameInput.style.display = "none";
                    
                    const endpoint = pendingSaveType === "model" ? "/rayko_models/save_preset" : "/rayko_loras/save_preset";
                    const payload = pendingSaveType === "model" ? { name, ...collectPresetData() } : { name, ...collectLoraPresetData() };

                    fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    })
                    .then(res => {
                        if (!res.ok) {
                            return res.text().then(text => { throw new Error(text || res.statusText); });
                        }
                    })
                    .catch(err => {
                        console.error(`[Rayko] Failed to save preset:`, err);
                        alert(`Failed to save preset:\n${err.message}`);
                    });
                };

                inputOk.addEventListener("click", performSave);
                inputCancel.addEventListener("click", () => { presetNameInput.style.display = "none"; });
                inputField.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") performSave();
                    if (e.key === "Escape") presetNameInput.style.display = "none";
                });

                const showPresetList = async (btnElement) => {
                    const rect = btnElement.getBoundingClientRect();
                    presetListOverlay.style.left = rect.left + "px";
                    presetListOverlay.style.top = (rect.bottom + 5) + "px";
                    presetListOverlay.innerHTML = "<div style='padding:8px;color:#999;text-align:center;'>Loading...</div>";
                    presetListOverlay.style.display = "flex";
                    try {
                        const endpoint = pendingSelectType === "model" ? "/rayko_models/list_presets" : "/rayko_loras/list_presets";
                        const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" } });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const list = await res.json();
                        presetListOverlay.innerHTML = "";
                        if (!list.length) {
                            presetListOverlay.textContent = "No presets found";
                            return;
                        }
                        list.forEach(name => {
                            const row = document.createElement("div");
                            row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #333;";
                            
                            const nameSpan = document.createElement("span");
                            nameSpan.textContent = name;
                            nameSpan.style.cssText = "flex:1;cursor:pointer;color:#ccc;font-size:12px;";
                            nameSpan.onmouseenter = () => nameSpan.style.background = "#3a3a3a";
                            nameSpan.onmouseleave = () => nameSpan.style.background = "transparent";
                            nameSpan.onclick = async (e) => {
                                e.stopPropagation();
                                presetListOverlay.style.display = "none";
                                const loadEndpoint = pendingSelectType === "model" ? "/rayko_models/load_preset" : "/rayko_loras/load_preset";
                                try {
                                    const res2 = await fetch(loadEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
                                    if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
                                    const data = await res2.json();
                                    if (pendingSelectType === "model") applyPresetData(data);
                                    else applyLoraPresetData(data);
                                } catch (err) {
                                    console.error(`[Rayko] Failed to load preset:`, err);
                                    alert(`Failed to load preset: ${err.message}`);
                                }
                            };
                            
                            const delBtn = document.createElement("span");
                            delBtn.textContent = "❌";
                            delBtn.style.cssText = "cursor:pointer;margin-left:8px;font-size:14px;opacity:0.7;";
                            delBtn.onmouseenter = () => { delBtn.style.opacity = "1"; delBtn.style.transform = "scale(1.2)"; };
                            delBtn.onmouseleave = () => { delBtn.style.opacity = "0.7"; delBtn.style.transform = "scale(1)"; };
                            delBtn.onclick = (e) => {
                                e.stopPropagation();
                                pendingDeleteName = name;
                                pendingDeleteType = pendingSelectType;
                                deleteText.textContent = `Delete "${name}"?`;
                                const r = btnElement.getBoundingClientRect();
                                deleteConfirmOverlay.style.left = r.left + "px";
                                deleteConfirmOverlay.style.top = (r.bottom + 5) + "px";
                                deleteConfirmOverlay.style.display = "block";
                            };
                            row.appendChild(nameSpan);
                            row.appendChild(delBtn);
                            presetListOverlay.appendChild(row);
                        });
                    } catch (e) {
                        console.error(`[Rayko] Failed to list presets:`, e);
                        presetListOverlay.textContent = "Error loading";
                    }
                };

                selectPresetBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    presetNameInput.style.display = "none";
                    deleteConfirmOverlay.style.display = "none";
                    if (presetListOverlay.style.display === "flex") { presetListOverlay.style.display = "none"; return; }
                    pendingSelectType = "model";
                    showPresetList(selectPresetBtn);
                });

                selectLoraPresetBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    presetNameInput.style.display = "none";
                    deleteConfirmOverlay.style.display = "none";
                    if (presetListOverlay.style.display === "flex") { presetListOverlay.style.display = "none"; return; }
                    pendingSelectType = "lora";
                    showPresetList(selectLoraPresetBtn);
                });

                deleteOk.addEventListener("click", async () => {
                    if (pendingDeleteName) {
                        const endpoint = pendingDeleteType === "model" ? "/rayko_models/delete_preset" : "/rayko_loras/delete_preset";
                        try {
                            const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pendingDeleteName }) });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            deleteConfirmOverlay.style.display = "none";
                            presetListOverlay.style.display = "none";
                            pendingDeleteName = null;
                        } catch (err) {
                            console.error(`[Rayko] Failed to delete preset:`, err);
                            alert(`Failed to delete preset: ${err.message}`);
                        }
                    }
                });

                deleteCancel.addEventListener("click", () => { deleteConfirmOverlay.style.display = "none"; pendingDeleteName = null; });

                document.addEventListener("click", (e) => {
                    if (!presetListOverlay?.contains(e.target)) presetListOverlay.style.display = "none";
                    if (!presetNameInput?.contains(e.target)) presetNameInput.style.display = "none";
                    if (!deleteConfirmOverlay?.contains(e.target)) deleteConfirmOverlay.style.display = "none";
                });

                this.addWidget("button", "✔️ Update LoRA list", "", async () => {
                    await this.loadLoraList();
                    if (this.graph) this.graph.setDirtyCanvas(true, true);
                });

                this.addWidget("button", "➕ Add LoRA", "", () => {
                    const btnWidget = this.widgets.find(w => w.name === "➕ Add LoRA");
                    this.showLoraTreeSelector(btnWidget);
                });

                const self = this;
                
                this.wheelHandler = function(e) {
                    if (app.canvas.node_over !== self) return;

                    const graphPos = app.canvas.graph_mouse;
                    if (!graphPos) return;

                    const relY = graphPos[1] - self.pos[1];
                    const startY = self.getLoraListStartY();
                    const rowH = self.rowHeight;
                    
                    const availableHeight = self.size[1] - startY - 10;
                    const maxVisibleStyles = Math.max(1, Math.floor(availableHeight / rowH));
                    const stylesEndY = startY + maxVisibleStyles * rowH;
                    
                    if (relY < startY || relY > stylesEndY) return;
                    if (self.loraRows.length <= maxVisibleStyles) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    const delta = e.deltaY > 0 ? 1 : -1;
                    const maxOffset = self.loraRows.length - maxVisibleStyles;
                    const newOffset = Math.max(0, Math.min(self.scrollOffset + delta, maxOffset));
                    
                    if (newOffset !== self.scrollOffset) {
                        self.scrollOffset = newOffset;
                        self.syncData();
                        self.graph.setDirtyCanvas(true, true);
                    }
                };

                const initialCanvas = app.canvas.canvas;
                initialCanvas.addEventListener('wheel', this.wheelHandler, { capture: true, passive: false });
                this.oldWheelCanvas = initialCanvas;
                this.oldWheelHandler = this.wheelHandler;

                this.visibilityHandler = function() {
                    if (!document.hidden) {
                        setTimeout(() => {
                            const currentCanvas = app.canvas.canvas;
                            if (self.oldWheelCanvas && self.oldWheelCanvas !== currentCanvas) {
                                self.oldWheelCanvas.removeEventListener('wheel', self.oldWheelHandler, { capture: true, passive: false });
                                currentCanvas.addEventListener('wheel', self.wheelHandler, { capture: true, passive: false });
                                self.oldWheelCanvas = currentCanvas;
                                self.oldWheelHandler = self.wheelHandler;
                            }
                        }, 150);
                    }
                };
                document.addEventListener("visibilitychange", this.visibilityHandler);

                const onResize = this.onResize;
                this.onResize = function(size) {
                    if (size[0] < self.MIN_WIDTH) size[0] = self.MIN_WIDTH;
                    const minH = self.getLoraListStartY() + self.rowHeight + 10;
                    if (size[1] < minH) size[1] = minH;
                    
                    const availableHeight = size[1] - self.getLoraListStartY() - 10;
                    const maxVisibleStyles = Math.max(1, Math.floor(availableHeight / self.rowHeight));
                    const maxOffset = Math.max(0, self.loraRows.length - maxVisibleStyles);
                    if (self.scrollOffset > maxOffset) {
                        self.scrollOffset = maxOffset;
                    }
                    
                    if (!self.isAutoResizing) {
                        self.manual_size = true;
                        self.syncData();
                    }
                    if (onResize) {
                        return onResize.apply(this, arguments);
                    }
                };

                setTimeout(() => {
                    if (this.id) {
                        this.storageKey = `rayko_lora_${this.id}`;
                        this.loadLoraList().then(() => {
                            this.restoreData();
                            this.isInitialized = true;
                            self.updateUI();
                        });
                    }
                }, 100);

                return result;
            };

            nodeType.prototype.onConfigure = function(info) {
                this.isRestoring = true;
                if (info.properties && info.properties["lora_rows"]) {
                    try {
                        const saved = JSON.parse(info.properties["lora_rows"]);
                        if (Array.isArray(saved)) this.loraRows = saved;
                    } catch (e) {}
                }
                if (info.properties && info.properties["manual_size"] !== undefined) {
                    this.manual_size = info.properties["manual_size"];
                }
                if (info.properties && info.properties["scrollOffset"] !== undefined) {
                    this.scrollOffset = info.properties["scrollOffset"];
                }
                if (info.widgets_values && Array.isArray(info.widgets_values)) {
                    for (let i = 0; i < info.widgets_values.length; i++) {
                        const val = info.widgets_values[i];
                        if (val && typeof val === "string" && val.startsWith("[")) {
                            try {
                                const saved = JSON.parse(val);
                                if (Array.isArray(saved) && saved.length > 0) {
                                    this.loraRows = saved;
                                    break;
                                }
                            } catch (e) {}
                        }
                    }
                }
                this.isRestoring = false;
                const self = this;
                this.loadLoraList().then(() => {
                    self.updateUI();
                    
                    requestAnimationFrame(() => {
                        if (!self.manual_size) {
                            const startY = self.getLoraListStartY();
                            const desiredVisible = Math.max(1, Math.min(self.loraRows.length, 10));
                            const calculatedHeight = startY + (desiredVisible * self.rowHeight) + 10;
                            self.isAutoResizing = true;
                            self.setSize([self.size[0], calculatedHeight]);
                            self.isAutoResizing = false;
                            if (self.graph) {
                                self.graph.setDirtyCanvas(true, true);
                                setTimeout(() => self.graph.setDirtyCanvas(true, true), 50);
                                setTimeout(() => self.graph.setDirtyCanvas(true, true), 100);
                                setTimeout(() => self.graph.setDirtyCanvas(true, true), 150);
                            }
                        }
                    });
                });
                
                const useClip2Widget = this.widgets.find(w => w.name === "use_clip2");
                const clipName2Widget = this.widgets.find(w => w.name === "clip_name2");
                if (useClip2Widget && clipName2Widget) {
                    clipName2Widget.disabled = !useClip2Widget.value;
                    if (clipName2Widget.element) {
                        clipName2Widget.element.classList.toggle("comfy-disabled", clipName2Widget.disabled);
                    }
                }
                return originalOnConfigure ? originalOnConfigure.apply(this, arguments) : undefined;
            };

            nodeType.prototype.saveToStorage = function() {
                if (!this.storageKey) return;
                try {
                    localStorage.setItem(this.storageKey, JSON.stringify({ loraRows: this.loraRows, timestamp: Date.now() }));
                } catch (e) {}
            };

            nodeType.prototype.restoreFromStorage = function() {
                if (!this.storageKey) return null;
                try {
                    const stored = localStorage.getItem(this.storageKey);
                    if (stored) {
                        const data = JSON.parse(stored);
                        if (Date.now() - data.timestamp < 86400000 && Array.isArray(data.loraRows)) return data.loraRows;
                    }
                } catch (e) {}
                return null;
            };

            nodeType.prototype.restoreData = function() {
                if (this.isRestoring) return;
                let savedData = null;
                if (this.properties && this.properties["lora_rows"]) {
                    try {
                        savedData = JSON.parse(this.properties["lora_rows"]);
                        if (Array.isArray(savedData) && savedData.length > 0) { this.loraRows = savedData; return; }
                    } catch (e) {}
                }
                if (!savedData && this.hiddenWidget && this.hiddenWidget.value) {
                    try {
                        const widgetVal = JSON.parse(this.hiddenWidget.value);
                        if (Array.isArray(widgetVal) && widgetVal.length > 0) { this.loraRows = widgetVal; return; }
                    } catch (e) {}
                }
                if (!savedData) {
                    savedData = this.restoreFromStorage();
                    if (savedData) this.loraRows = savedData;
                }
            };

            nodeType.prototype.loadLoraList = async function() {
                try {
                    const response = await api.fetchApi("/rayko/get_loras");
                    const data = await response.json();
                    this.loraOptions = data.filter(l => l !== "None" && l !== null && l !== undefined);
                    this.loraTree = this.buildLoraTree(this.loraOptions);
                } catch (e) {
                    this.loraOptions = [];
                    this.loraTree = {};
                }
            };

            nodeType.prototype.buildLoraTree = function(loraList) {
                const tree = {};
                for (const lora of loraList) {
                    if (!lora || lora === "None") continue;
                    const normalizedPath = lora.replace(/\\/g, "/");
                    const parts = normalizedPath.split("/");
                    let current = tree;
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        const isLast = i === parts.length - 1;
                        if (!current[part]) current[part] = isLast ? null : {};
                        if (!isLast) current = current[part];
                    }
                }
                return tree;
            };

            nodeType.prototype.getLoraListStartY = function() {
                const addButton = this.widgets.find(w => w.name === "➕ Add LoRA");
                if (!addButton) return 40;
                return addButton.y + addButton.height + 15;
            };

            nodeType.prototype.onDrawForeground = function(ctx, visibleRect) {
                if (this.loraRows.length === 0) {
                    if (!this.manual_size && this.graph) {
                        const startY = this.getLoraListStartY();
                        const baseHeight = startY + this.rowHeight + 10;
                        if (Math.abs(this.size[1] - baseHeight) > 1) {
                            this.isAutoResizing = true;
                            this.setSize([this.size[0], baseHeight]);
                            this.isAutoResizing = false;
                        }
                    }
                    return;
                }

                this.clickZones = [];
                const startY = this.getLoraListStartY();
                const padding = 10;
                const rightPanelWidth = 180;

                const availableHeight = this.size[1] - startY - 10;
                const maxVisibleStyles = Math.max(1, Math.floor(availableHeight / this.rowHeight));
                
                const maxOffset = Math.max(0, this.loraRows.length - maxVisibleStyles);
                if (this.scrollOffset > maxOffset) {
                    this.scrollOffset = maxOffset;
                }

                if (!this.manual_size && this.graph) {
                    const desiredVisible = Math.max(1, Math.min(this.loraRows.length, 10));
                    const calculatedHeight = startY + (desiredVisible * this.rowHeight) + 10;
                    
                    if (Math.abs(this.size[1] - calculatedHeight) > 1) {
                        this.isAutoResizing = true;
                        this.setSize([this.size[0], calculatedHeight]);
                        this.isAutoResizing = false;
                    }
                }

                const visibleStart = this.scrollOffset;
                const visibleEnd = Math.min(visibleStart + maxVisibleStyles, this.loraRows.length);

                for (let i = 0; i < visibleEnd - visibleStart; i++) {
                    const dataIdx = visibleStart + i;
                    const row = this.loraRows[dataIdx];
                    const y = startY + (i * this.rowHeight);
                    const h = this.rowHeight - 2;
                    const toggleY = y + h/2;

                    ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)";
                    ctx.fillRect(padding, y, this.size[0] - (padding * 2), h);

                    const toggleX = padding + 5;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.arc(toggleX + 8, toggleY, 7, 0, Math.PI * 2);
                    ctx.fill();
                    this.clickZones.push({ type: "toggle", index: dataIdx, x: toggleX, y: y, w: 24, h: h });

                    const nameX = toggleX + 30;
                    const nameW = this.size[0] - (padding * 2) - 30 - rightPanelWidth - 20;
                    ctx.fillStyle = row.enabled ? "#fff" : "#777";
                    ctx.font = "12px sans-serif";
                    let displayName = row.name;
                    if (ctx.measureText(displayName).width > nameW) {
                        while (ctx.measureText(displayName + "...").width > nameW && displayName.length > 0) {
                            displayName = displayName.slice(0, -1);
                        }
                        displayName += "...";
                    }
                    ctx.fillText(displayName, nameX, toggleY + 4);
                    this.clickZones.push({ type: "name", index: dataIdx, x: nameX, y: y, w: nameW, h: h });

                    const arrowLX = this.size[0] - rightPanelWidth + 10;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.moveTo(arrowLX + 18, y + 8);
                    ctx.lineTo(arrowLX + 8, toggleY);
                    ctx.lineTo(arrowLX + 18, y + 22);
                    ctx.fill();
                    this.clickZones.push({ type: "left", index: dataIdx, x: arrowLX, y: y, w: 28, h: h });

                    const strInputX = arrowLX + 33;
                    const strInputW = 55;
                    ctx.fillStyle = "#222";
                    ctx.fillRect(strInputX, y + 5, strInputW, h - 10);
                    ctx.strokeStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.strokeRect(strInputX, y + 5, strInputW, h - 10);
                    ctx.fillStyle = row.enabled ? "#fff" : "#777";
                    ctx.textAlign = "center";
                    ctx.fillText(row.strength_model.toFixed(2), strInputX + strInputW/2, toggleY + 4);
                    ctx.textAlign = "left";
                    this.clickZones.push({ type: "strength_input", index: dataIdx, x: strInputX, y: y, w: strInputW, h: h });

                    const arrowRX = strInputX + strInputW + 5;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.moveTo(arrowRX + 10, y + 8);
                    ctx.lineTo(arrowRX + 20, toggleY);
                    ctx.lineTo(arrowRX + 10, y + 22);
                    ctx.fill();
                    this.clickZones.push({ type: "right", index: dataIdx, x: arrowRX, y: y, w: 28, h: h });

                    ctx.fillStyle = "#f44336";
                    ctx.fillText("❌️", arrowRX + 35, toggleY + 4);
                    this.clickZones.push({ type: "delete", index: dataIdx, x: arrowRX + 35, y: y, w: 30, h: h });
                }

                if (this.loraRows.length > maxVisibleStyles) {
                    if (this.scrollOffset > 0) {
                        const indicatorY = startY - 2;
                        ctx.fillStyle = "rgba(255, 215, 0, 0.6)";
                        ctx.beginPath();
                        ctx.moveTo(this.size[0]/2 - 8, indicatorY);
                        ctx.lineTo(this.size[0]/2 + 8, indicatorY);
                        ctx.lineTo(this.size[0]/2, indicatorY - 8);
                        ctx.closePath();
                        ctx.fill();
                    }
                    
                    if (visibleEnd < this.loraRows.length) {
                        const indicatorY = startY + (visibleEnd - visibleStart) * this.rowHeight + 2;
                        ctx.fillStyle = "rgba(255, 215, 0, 0.6)";
                        ctx.beginPath();
                        ctx.moveTo(this.size[0]/2 - 8, indicatorY);
                        ctx.lineTo(this.size[0]/2 + 8, indicatorY);
                        ctx.lineTo(this.size[0]/2, indicatorY + 8);
                        ctx.closePath();
                        ctx.fill();
                    }
                }
            };

            nodeType.prototype.onMouseDown = function(e, pos, canvas) {
                if (!this.clickZones || this.clickZones.length === 0) return false;
                for (const zone of this.clickZones) {
                    if (pos[0] >= zone.x && pos[0] <= zone.x + zone.w && pos[1] >= zone.y && pos[1] <= zone.y + zone.h) {
                        if (zone.type === "toggle") {
                            this.loraRows[zone.index].enabled = !this.loraRows[zone.index].enabled;
                            this.syncData();
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        } else if (zone.type === "strength_input") {
                            const newValue = prompt("Enter strength LoRA:", this.loraRows[zone.index].strength_model.toFixed(2));
                            if (newValue !== null) {
                                const parsed = parseFloat(newValue);
                                if (!isNaN(parsed) && parsed >= -10 && parsed <= 10) {
                                    this.loraRows[zone.index].strength_model = parsed;
                                    this.syncData();
                                    if (this.graph) this.graph.setDirtyCanvas(true, true);
                                }
                            }
                            return true;
                        } else if (zone.type === "left") {
                            this.loraRows[zone.index].strength_model = Math.max(-10, Math.round((this.loraRows[zone.index].strength_model - 0.05) * 20) / 20);
                            this.syncData();
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        } else if (zone.type === "right") {
                            this.loraRows[zone.index].strength_model = Math.min(10, Math.round((this.loraRows[zone.index].strength_model + 0.05) * 20) / 20);
                            this.syncData();
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        } else if (zone.type === "delete") {
                            this.loraRows.splice(zone.index, 1);
                            this.scrollOffset = 0;
                            this.manual_size = false;
                            this.syncData();
                            
                            requestAnimationFrame(() => {
                                const startY = this.getLoraListStartY();
                                const desiredVisible = Math.max(1, Math.min(this.loraRows.length, 10));
                                const calculatedHeight = startY + (desiredVisible * this.rowHeight) + 10;
                                this.isAutoResizing = true;
                                this.setSize([this.size[0], calculatedHeight]);
                                this.isAutoResizing = false;
                                if (this.graph) {
                                    this.graph.setDirtyCanvas(true, true);
                                    setTimeout(() => this.graph.setDirtyCanvas(true, true), 50);
                                    setTimeout(() => this.graph.setDirtyCanvas(true, true), 100);
                                    setTimeout(() => this.graph.setDirtyCanvas(true, true), 150);
                                }
                            });
                            
                            return true;
                        }
                    }
                }
                return false;
            };

            nodeType.prototype.showLoraTreeSelector = function(widget) {
                const self = this;
                const expandedFolders = {};
                this.currentFilter = "";
                
                const menuWidth = 450;
                const menuHeight = 600;
                let menuLeft = 100;
                let menuTop = 100;

                if (widget && app && app.canvas) {
                    const rect = app.canvas.canvas.getBoundingClientRect();
                    const scale = app.canvas.ds.scale;
                    const offsetX = app.canvas.ds.offset[0];
                    const offsetY = app.canvas.ds.offset[1];

                    const nodeRightX = this.pos[0] + this.size[0];
                    const nodeLeftX = this.pos[0];
                    const widgetTopY = this.pos[1] + widget.y;

                    let calculatedLeft = rect.left + (nodeRightX * scale) + offsetX + 10;
                    const calculatedTop = rect.top + (widgetTopY * scale) + offsetY;

                    if (calculatedLeft + menuWidth > window.innerWidth) {
                        calculatedLeft = rect.left + (nodeLeftX * scale) + offsetX - menuWidth - 10;
                    }

                    if (calculatedLeft < 10) calculatedLeft = 10;

                    let finalTop = calculatedTop;
                    if (finalTop + menuHeight > window.innerHeight) {
                        finalTop = window.innerHeight - menuHeight - 10;
                    }
                    if (finalTop < 10) finalTop = 10;

                    menuLeft = calculatedLeft;
                    menuTop = finalTop;
                }

                const existingMenu = document.getElementById("rayko-lora-selector-menu");
                if (existingMenu) existingMenu.remove();

                const menu = document.createElement("div");
                menu.id = "rayko-lora-selector-menu";
                menu.style.cssText = `position: fixed; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; height: ${menuHeight}px; width: ${menuWidth}px; overflow-y: auto; overflow-x: hidden; z-index: 10000; left: ${menuLeft}px; top: ${menuTop}px; box-shadow: 0 4px 20px rgba(0,0,0,0.8); display: flex; flex-direction: column;`;

                const headerContainer = document.createElement("div");
                headerContainer.style.cssText = `padding: 10px; background: #252525; border-bottom: 1px solid #333; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;`;

                const title = document.createElement("div");
                title.textContent = " Search & Select LoRA";
                title.style.cssText = `color: #fff; font-weight: bold; font-size: 14px;`;
                
                const searchInput = document.createElement("input");
                searchInput.type = "text";
                searchInput.placeholder = "Type to search LoRA...";
                searchInput.style.cssText = `width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; outline: none; font-size: 13px; box-sizing: border-box;`;
                searchInput.autofocus = true;

                headerContainer.appendChild(title);
                headerContainer.appendChild(searchInput);
                menu.appendChild(headerContainer);

                const listContainer = document.createElement("div");
                listContainer.style.cssText = `padding: 5px 0; overflow-y: auto; flex-grow: 1;`;
                menu.appendChild(listContainer);

                const getAllPaths = (tree, currentPath = "") => {
                    let paths = [];
                    for (const name in tree) {
                        const subTree = tree[name];
                        const fullPath = currentPath ? `${currentPath}/${name}` : name;
                        const isFolder = subTree !== null;
                        paths.push({ path: fullPath, isFolder: isFolder });
                        if (isFolder) paths = paths.concat(getAllPaths(subTree, fullPath));
                    }
                    return paths;
                };

                const isLoraAlreadyAdded = (loraName) => {
                    return self.loraRows.some(row => row.name === loraName);
                };

                const renderList = (filterText = "") => {
                    listContainer.innerHTML = "";
                    const lowerFilter = filterText.trim().toLowerCase();
                    self.currentFilter = filterText;

                    if (!filterText || "none".includes(lowerFilter)) {
                        const isAdded = isLoraAlreadyAdded("None");
                        const noneItem = document.createElement("div");
                        noneItem.textContent = (isAdded ? "✓ " : "") + "None";
                        noneItem.style.cssText = `padding: 10px 12px; cursor: pointer; color: ${isAdded ? '#4CAF50' : '#aaa'}; border-bottom: 1px solid #333; background: #2a2a2a; font-style: italic;`;
                        noneItem.onmouseenter = () => noneItem.style.background = "#3a3a3a";
                        noneItem.onmouseleave = () => noneItem.style.background = "#2a2a2a";
                        noneItem.onclick = (e) => { 
                            e.stopPropagation(); 
                            if (!isLoraAlreadyAdded("None")) {
                                self.addLoraRow("None");
                                renderList(filterText);
                            }
                        };
                        listContainer.appendChild(noneItem);
                    }

                    if (Object.keys(self.loraTree).length === 0) {
                        if (!filterText) {
                            const emptyMsg = document.createElement("div");
                            emptyMsg.textContent = " List is empty (Click Update LoRA list)";
                            emptyMsg.style.cssText = `padding: 20px; color: #f44336; text-align: center;`;
                            listContainer.appendChild(emptyMsg);
                        }
                        return;
                    }

                    if (lowerFilter.length > 0) {
                        const allPaths = getAllPaths(self.loraTree);
                        const matches = allPaths.filter(item => !item.isFolder && item.path.toLowerCase().includes(lowerFilter));
                        if (matches.length === 0) {
                            const noRes = document.createElement("div");
                            noRes.textContent = `No files found for "${filterText}"`;
                            noRes.style.cssText = "padding: 15px; color: #777; text-align: center; font-style: italic;";
                            listContainer.appendChild(noRes);
                        } else {
                            matches.forEach(item => {
                                const isAdded = isLoraAlreadyAdded(item.path);
                                const el = document.createElement("div");
                                el.textContent = (isAdded ? "✓ " : " ") + item.path;
                                el.style.cssText = `padding: 8px 12px; cursor: pointer; color: ${isAdded ? '#4CAF50' : '#ddd'}; font-size: 12px; border-bottom: 1px solid #2a2a2a; background: transparent;`;
                                el.onmouseenter = () => el.style.background = "#333";
                                el.onmouseleave = () => el.style.background = "transparent";
                                el.onclick = (e) => { 
                                    e.stopPropagation(); 
                                    if (!isLoraAlreadyAdded(item.path)) {
                                        self.addLoraRow(item.path);
                                        renderList(filterText);
                                    }
                                };
                                listContainer.appendChild(el);
                            });
                        }
                    } else {
                        listContainer.innerHTML = "";
                        createTreeItems("", self.loraTree, 0, listContainer, expandedFolders, self, null, null, renderList);
                    }
                };

                renderList("");

                let timeoutId = null;
                searchInput.addEventListener("input", (e) => {
                    if (timeoutId) clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => renderList(e.target.value), 50);
                });

                document.body.appendChild(menu);
                setTimeout(() => searchInput.focus(), 50);

                let closeTimer = null;
                const closeDelay = 300;

                const closeMenu = () => {
                    if (menu && menu.parentNode) {
                        menu.remove();
                    }
                    document.removeEventListener("pointerdown", handleOutsideClick, true);
                    document.removeEventListener("keydown", handleEsc, true);
                    if (closeTimer) {
                        clearTimeout(closeTimer);
                        closeTimer = null;
                    }
                };

                const handleEsc = (ev) => {
                    if (ev.key === "Escape") closeMenu();
                };

                const handleOutsideClick = (ev) => {
                    if (menu.contains(ev.target)) {
                        if (closeTimer) {
                            clearTimeout(closeTimer);
                            closeTimer = null;
                        }
                        return;
                    }
                    closeMenu();
                };

                menu.addEventListener("mouseleave", () => {
                    closeTimer = setTimeout(() => {
                        closeMenu();
                    }, closeDelay);
                });

                menu.addEventListener("mouseenter", () => {
                    if (closeTimer) {
                        clearTimeout(closeTimer);
                        closeTimer = null;
                    }
                });

                setTimeout(() => {
                    document.addEventListener("pointerdown", handleOutsideClick, true);
                    document.addEventListener("keydown", handleEsc, true);
                }, 50);
            };

            nodeType.prototype.addLoraRow = function(loraName) {
                const exists = this.loraRows.some(row => row.name === loraName);
                if (exists) return;
                
                this.loraRows.push({ name: loraName, strength_model: 1.0, strength_clip: 1.0, enabled: true });
                this.scrollOffset = 0;
                this.manual_size = false;
                this.syncData();
                
                requestAnimationFrame(() => {
                    const startY = this.getLoraListStartY();
                    const desiredVisible = Math.max(1, Math.min(this.loraRows.length, 10));
                    const calculatedHeight = startY + (desiredVisible * this.rowHeight) + 10;
                    this.isAutoResizing = true;
                    this.setSize([this.size[0], calculatedHeight]);
                    this.isAutoResizing = false;
                    if (this.graph) {
                        this.graph.setDirtyCanvas(true, true);
                        setTimeout(() => this.graph.setDirtyCanvas(true, true), 50);
                        setTimeout(() => this.graph.setDirtyCanvas(true, true), 100);
                        setTimeout(() => this.graph.setDirtyCanvas(true, true), 150);
                    }
                });
            };

            nodeType.prototype.updateUI = function() {
                this.syncData();
                if (this.graph) this.graph.setDirtyCanvas(true, true);
            };

            nodeType.prototype.syncData = function() {
                if (this.isRestoring) return;
                const jsonData = JSON.stringify(this.loraRows);
                if (this.hiddenWidget) this.hiddenWidget.value = jsonData;
                if (!this.properties) this.properties = {};
                this.properties["lora_rows"] = jsonData;
                this.properties["manual_size"] = this.manual_size;
                this.properties["scrollOffset"] = this.scrollOffset;
                this.saveToStorage();
            };

            nodeType.prototype.onSerialize = function(o) {
                this.syncData();
                if (!o.properties) o.properties = {};
                o.properties["lora_rows"] = this.properties["lora_rows"];
                o.properties["manual_size"] = this.manual_size;
                o.properties["scrollOffset"] = this.scrollOffset;
                return originalOnSerialize ? originalOnSerialize.apply(this, arguments) : undefined;
            };

            nodeType.prototype.onRemoved = function() {
                if (this.storageKey) localStorage.removeItem(this.storageKey);
                if (this.wheelHandler && this.oldWheelCanvas) {
                    this.oldWheelCanvas.removeEventListener('wheel', this.wheelHandler, { capture: true, passive: false });
                }
                document.removeEventListener("visibilitychange", this.visibilityHandler);
                return originalOnRemoved ? originalOnRemoved.apply(this, arguments) : undefined;
            };
        }
    }
});

document.addEventListener("visibilitychange", () => {
    if (!document.hidden && app && app.graph) {
        setTimeout(() => {
            app.graph._nodes.forEach(node => {
                if (node.type === "RaykoModelsLoader" && node.restoreData) {
                    node.restoreData();
                    node.updateUI();
                }
            });
        }, 200);
    }
});

window.addEventListener("focus", () => {
    if (app && app.graph) {
        setTimeout(() => {
            app.graph._nodes.forEach(node => {
                if (node.type === "RaykoModelsLoader" && node.restoreData) {
                    node.restoreData();
                    node.updateUI();
                }
            });
        }, 200);
    }
});

function createTreeItems(path, tree, level, container, expandedFolders, self, header, noneItem, renderList) {
    const sortedKeys = Object.keys(tree).sort((a, b) => {
        const aIsFolder = tree[a] !== null;
        const bIsFolder = tree[b] !== null;
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    const isLoraAlreadyAdded = (loraName) => {
        return self.loraRows.some(row => row.name === loraName);
    };

    for (const name of sortedKeys) {
        const subTree = tree[name];
        const isFolder = subTree !== null;
        const itemPath = path ? path + "/" + name : name;

        if (isFolder) {
            const folderContainer = document.createElement("div");
            const folderHeader = document.createElement("div");
            folderHeader.style.cssText = `padding: 8px 12px; cursor: pointer; color: #ffd700; font-size: 13px; background: #252525; display: flex; align-items: center;`;
            folderHeader.style.paddingLeft = (12 + level * 16) + "px";
            const isExpanded = expandedFolders[itemPath];
            folderHeader.innerHTML = `<span style="margin-right:8px;">${isExpanded ? "▼" : "▶"}</span> 📁 ${name}`;
            folderHeader.onclick = (e) => {
                e.stopPropagation();
                expandedFolders[itemPath] = !expandedFolders[itemPath];
                container.innerHTML = "";
                createTreeItems("", self.loraTree, 0, container, expandedFolders, self, header, noneItem, renderList);
            };
            folderContainer.appendChild(folderHeader);
            container.appendChild(folderContainer);
            if (expandedFolders[itemPath]) {
                createTreeItems(itemPath, subTree, level + 1, container, expandedFolders, self, header, noneItem, renderList);
            }
        } else {
            const isAdded = isLoraAlreadyAdded(itemPath);
            const fileItem = document.createElement("div");
            fileItem.textContent = (isAdded ? "✓ " : " ") + name;
            fileItem.style.cssText = `padding: 8px 12px; cursor: pointer; color: ${isAdded ? '#4CAF50' : '#ddd'}; font-size: 12px;`;
            fileItem.style.paddingLeft = (12 + level * 16) + "px";
            
            fileItem.onmouseenter = () => fileItem.style.background = "#333";
            fileItem.onmouseleave = () => fileItem.style.background = "transparent";
            
            fileItem.onclick = (e) => {
                e.stopPropagation();
                if (!isLoraAlreadyAdded(itemPath)) {
                    self.addLoraRow(itemPath);
                    if (renderList) {
                        renderList(self.currentFilter);
                    }
                }
            };
            container.appendChild(fileItem);
        }
    }
}