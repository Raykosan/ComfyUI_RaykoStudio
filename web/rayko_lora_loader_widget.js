import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

window.showRaykoToast = function(message, type = "error", node = null) {
    const existing = document.querySelector(".rayko-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "rayko-toast";
    const bgColor = type === "error" ? "#f44336" : "#4CAF50";
    toast.style.cssText = `
        position: fixed; background: ${bgColor}; color: white;
        padding: 12px 20px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        z-index: 100000; font-size: 14px; font-family: sans-serif; opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease; transform: translateY(-20px);
        pointer-events: none; white-space: nowrap;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    const toastRect = toast.getBoundingClientRect();
    
    let left, top;
    
    if (node && app && app.canvas) {
        const canvasRect = app.canvas.canvas.getBoundingClientRect();
        const scale = app.canvas.ds.scale;
        const offsetX = app.canvas.ds.offset[0];
        const offsetY = app.canvas.ds.offset[1];
        
        const nodeCenterGraphX = node.pos[0] + node.size[0] / 2;
        const nodeCenterGraphY = node.pos[1] + node.size[1] / 2;
        
        const nodeCenterScreenX = canvasRect.left + (nodeCenterGraphX + offsetX) * scale;
        const nodeCenterScreenY = canvasRect.top + (nodeCenterGraphY + offsetY) * scale;
        
        left = nodeCenterScreenX - (toastRect.width / 2);
        top = nodeCenterScreenY - (toastRect.height / 2);
        
        if (left < 10) left = 10;
        if (top < 10) top = 10;
        if (left + toastRect.width > window.innerWidth - 10) {
            left = window.innerWidth - toastRect.width - 10;
        }
        if (top + toastRect.height > window.innerHeight - 10) {
            top = window.innerHeight - toastRect.height - 10;
        }
    } else {
        left = window.innerWidth - toastRect.width - 20;
        top = 20;
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
};

app.registerExtension({
    name: "RaykoLoRALoaderWidget",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RaykoLoRALoader") {
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
                
                this.draggingIndex = null;
                this.dragCurrentY = null;
                
                this.hiddenWidget = this.widgets.find(w => w.name === "lora_data");
                const nodeRef = this;
                
                if (this.hiddenWidget) {
                    this.hiddenWidget.hidden = true;
                    if (this.hiddenWidget.element) {
                        this.hiddenWidget.element.style.display = "none";
                    }
                    const originalSerializeValue = this.hiddenWidget.serializeValue;
                    this.hiddenWidget.serializeValue = function() {
                        nodeRef.syncData();
                        const val = nodeRef.hiddenWidget ? nodeRef.hiddenWidget.value : "[]";
                        return (val !== undefined && val !== null) ? val : "[]";
                    };
                }

                const useClipWidget = this.widgets.find(w => w.name === "use_clip");
                if (useClipWidget) {
                    useClipWidget.hidden = true;
                    if (useClipWidget.element) {
                        useClipWidget.element.style.display = "none";
                    }
                }

                const updateClipInputState = () => {
                    if (!useClipWidget) return;
                    const clipSlotIndex = this.findInputSlot("clip");
                    if (clipSlotIndex !== -1 && this.inputs && this.inputs[clipSlotIndex]) {
                        const isEnabled = useClipWidget.value;
                        this.inputs[clipSlotIndex].disabled = !isEnabled;
                        if (isEnabled) {
                            delete this.inputs[clipSlotIndex].color;
                            this.inputs[clipSlotIndex].tooltip = "CLIP input enabled";
                        } else {
                            this.inputs[clipSlotIndex].color = "#555";
                            this.inputs[clipSlotIndex].tooltip = "CLIP input disabled";
                        }
                    }
                };

                this.setSize([this.targetWidth, this.size[1]]);

                const clipButtonRoot = document.createElement("div");
                clipButtonRoot.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;margin:0;padding:0;box-sizing:border-box;";

                const clipToggleBtn = document.createElement("button");
                clipToggleBtn.style.cssText = "flex:1;padding:4px 2px;font-size:11px;border-radius:5px;cursor:pointer;height:26px;margin:0;font-weight:bold;";
                
                const updateClipButton = () => {
                    const isEnabled = useClipWidget ? useClipWidget.value : true;
                    if (isEnabled) {
                        clipToggleBtn.textContent = "🟢 CLIP ON";
                        clipToggleBtn.style.cssText = "flex:1;padding:4px 2px;font-size:11px;border:1px solid #4CAF50;border-radius:5px;background:#1a3a1a;color:#aaffaa;cursor:pointer;height:26px;margin:0;font-weight:bold;";
                    } else {
                        clipToggleBtn.textContent = "🔴 CLIP OFF";
                        clipToggleBtn.style.cssText = "flex:1;padding:4px 2px;font-size:11px;border:1px solid #f44336;border-radius:5px;background:#3a1a1a;color:#ffaaaa;cursor:pointer;height:26px;margin:0;font-weight:bold;";
                    }
                };

                clipToggleBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (useClipWidget) {
                        const newValue = !useClipWidget.value;
                        useClipWidget.value = newValue;
                        if (useClipWidget.callback) useClipWidget.callback(newValue);
                        updateClipButton();
                        updateClipInputState();
                        nodeRef.graph?.setDirtyCanvas(true, true);
                    }
                });

                clipButtonRoot.appendChild(clipToggleBtn);

                const clipButtonWidget = this.addDOMWidget("clip_toggle_ui", "custom", clipButtonRoot);
                clipButtonWidget.computeSize = function() { return [this.width || 130, 30]; };

                const presetsWrapper = document.createElement("div");
                presetsWrapper.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;margin:0;padding:0;box-sizing:border-box;";

                const loraPresetsRoot = document.createElement("div");
                loraPresetsRoot.style.cssText = "display:flex;gap:4px;width:100%;align-items:center;height:30px;";
                
                const saveLoraPresetBtn = document.createElement("button");
                saveLoraPresetBtn.textContent = "💾 Save LoRA preset";
                saveLoraPresetBtn.style.cssText = "flex:1;padding:4px 2px;font-size:11px;border:1px solid #50cc90;border-radius:5px;background:#1a3a2a;color:#aaffcc;cursor:pointer;height:26px;margin:0;";
                
                const selectLoraPresetBtn = document.createElement("button");
                selectLoraPresetBtn.textContent = "📂 Select LoRA preset";
                selectLoraPresetBtn.style.cssText = "flex:1;padding:4px 2px;font-size:11px;border:1px solid #50cc90;border-radius:5px;background:#1a3a2a;color:#aaffcc;cursor:pointer;height:26px;margin:0;";
                loraPresetsRoot.append(saveLoraPresetBtn, selectLoraPresetBtn);
                
                presetsWrapper.append(loraPresetsRoot);

                const presetsWidget = this.addDOMWidget("presets_ui", "custom", presetsWrapper);
                presetsWidget.computeSize = function() { return [this.width || 130, 35]; };

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

                let pendingDeleteName = null;

                const openSaveDialog = (btnElement) => {
                    presetListOverlay.style.display = "none";
                    deleteConfirmOverlay.style.display = "none";
                    const rect = btnElement.getBoundingClientRect();
                    presetNameInput.style.left = rect.left + "px";
                    presetNameInput.style.top = (rect.bottom + 5) + "px";
                    presetNameInput.style.display = "block";
                    inputField.value = "";
                    setTimeout(() => inputField.focus(), 50);
                };

                saveLoraPresetBtn.addEventListener("click", (e) => { e.stopPropagation(); openSaveDialog(saveLoraPresetBtn); });

                const performSave = () => {
                    const name = inputField.value.trim();
                    if (!name) return;
                    presetNameInput.style.display = "none";
                    
                    const endpoint = "/rayko_lora_loader/save_preset";
                    const payload = { name, ...collectLoraPresetData() };

                    fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    })
                    .then(res => {
                        if (!res.ok) {
                            return res.text().then(text => { throw new Error(text || res.statusText); });
                        }
                        showRaykoToast("Preset saved successfully!", "success", this);
                    })
                    .catch(err => {
                        showRaykoToast("Failed to save preset: " + err.message, "error", this);
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
                        const endpoint = "/rayko_lora_loader/list_presets";
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
                                const loadEndpoint = "/rayko_lora_loader/load_preset";
                                try {
                                    const res2 = await fetch(loadEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
                                    if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
                                    const data = await res2.json();
                                    applyLoraPresetData(data);
                                    showRaykoToast("Preset loaded!", "success", this);
                                } catch (err) {
                                    showRaykoToast("Failed to load preset: " + err.message, "error", this);
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
                        showRaykoToast("Failed to list presets: " + e.message, "error", this);
                        presetListOverlay.textContent = "Error loading";
                    }
                };

                selectLoraPresetBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    presetNameInput.style.display = "none";
                    deleteConfirmOverlay.style.display = "none";
                    if (presetListOverlay.style.display === "flex") { presetListOverlay.style.display = "none"; return; }
                    showPresetList(selectLoraPresetBtn);
                });

                deleteOk.addEventListener("click", async () => {
                    if (pendingDeleteName) {
                        const endpoint = "/rayko_lora_loader/delete_preset";
                        try {
                            const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pendingDeleteName }) });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            deleteConfirmOverlay.style.display = "none";
                            presetListOverlay.style.display = "none";
                            pendingDeleteName = null;
                            showRaykoToast("Preset deleted!", "success", this);
                        } catch (err) {
                            showRaykoToast("Failed to delete preset: " + err.message, "error", this);
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

                updateClipButton();
                updateClipInputState();

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
                        this.storageKey = `rayko_lora_loader_${this.id}`;
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
                
                const useClipWidget = this.widgets.find(w => w.name === "use_clip");
                if (useClipWidget) {
                    const clipSlotIndex = this.findInputSlot("clip");
                    if (clipSlotIndex !== -1 && this.inputs && this.inputs[clipSlotIndex]) {
                        this.inputs[clipSlotIndex].disabled = !useClipWidget.value;
                        if (useClipWidget.value) {
                            delete this.inputs[clipSlotIndex].color;
                            this.inputs[clipSlotIndex].tooltip = "CLIP input enabled";
                        } else {
                            this.inputs[clipSlotIndex].color = "#555";
                            this.inputs[clipSlotIndex].tooltip = "CLIP input disabled";
                        }
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
                    const response = await api.fetchApi("/rayko_lora_loader/get_loras");
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
                    
                    if (this.draggingIndex === dataIdx) continue;

                    const y = startY + (i * this.rowHeight);
                    const h = this.rowHeight - 2;
                    const toggleY = y + h/2;

                    ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)";
                    ctx.fillRect(padding, y, this.size[0] - (padding * 2), h);

                    this.clickZones.push({ type: "drag", index: dataIdx, x: padding, y: y, w: 20, h: h });
                    ctx.fillStyle = "#888";
                    ctx.font = "14px sans-serif";
                    ctx.fillText("⋮⋮", padding + 2, toggleY + 5);

                    const toggleX = padding + 20;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.arc(toggleX + 8, toggleY, 7, 0, Math.PI * 2);
                    ctx.fill();
                    this.clickZones.push({ type: "toggle", index: dataIdx, x: toggleX, y: y, w: 24, h: h });

                    const infoX = toggleX + 15;
                    const infoW = 24;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.font = "bold 18px sans-serif";
                    ctx.fillText("ℹ️", infoX + 2, toggleY + 6);
                    this.clickZones.push({ type: "info", index: dataIdx, x: infoX, y: y, w: infoW, h: h });

                    const nameX = infoX + infoW + 5;
                    const nameW = this.size[0] - (padding * 2) - 50 - rightPanelWidth - 20 - infoW - 5;
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

                if (this.draggingIndex !== null && this.dragCurrentY !== null) {
                    const row = this.loraRows[this.draggingIndex];
                    const h = this.rowHeight - 2;
                    const y = this.dragCurrentY - (h / 2);
                    const toggleY = y + h/2;
                    const padding = 10;

                    ctx.globalAlpha = 0.8;
                    ctx.fillStyle = "#3a5a3a";
                    ctx.fillRect(padding, y, this.size[0] - (padding * 2), h);
                    
                    ctx.fillStyle = "#fff";
                    ctx.font = "14px sans-serif";
                    ctx.fillText("⋮⋮", padding + 2, toggleY + 5);
                    
                    ctx.font = "12px sans-serif";
                    ctx.fillText(row.name, padding + 25, toggleY + 4);
                    ctx.globalAlpha = 1.0;

                    const relativeY = this.dragCurrentY - startY;
                    let targetIndex = Math.floor(relativeY / this.rowHeight) + this.scrollOffset;
                    targetIndex = Math.max(0, Math.min(targetIndex, this.loraRows.length - 1));
                    
                    if (targetIndex !== this.draggingIndex) {
                        const targetY = startY + ((targetIndex - this.scrollOffset) * this.rowHeight);
                        ctx.strokeStyle = "#4CAF50";
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(padding, targetY);
                        ctx.lineTo(this.size[0] - padding, targetY);
                        ctx.stroke();
                        ctx.lineWidth = 1;
                    }
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
                        if (zone.type === "drag") {
                            this.draggingIndex = zone.index;
                            this.dragCurrentY = pos[1];
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        } else if (zone.type === "toggle") {
                            this.loraRows[zone.index].enabled = !this.loraRows[zone.index].enabled;
                            this.syncData();
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        } else if (zone.type === "info") {
                            const loraName = this.loraRows[zone.index].name;
                            this.showLoraInfo(loraName);
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

            nodeType.prototype.onMouseMove = function(e, pos, canvas) {
                if (this.draggingIndex !== null) {
                    this.dragCurrentY = pos[1];
                    if (this.graph) this.graph.setDirtyCanvas(true, true);
                    return true;
                }
                return false;
            };

            nodeType.prototype.onMouseUp = function(e, pos, canvas) {
                if (this.draggingIndex !== null) {
                    const startY = this.getLoraListStartY();
                    const relativeY = this.dragCurrentY - startY;
                    let targetIndex = Math.floor(relativeY / this.rowHeight) + this.scrollOffset;
                    targetIndex = Math.max(0, Math.min(targetIndex, this.loraRows.length - 1));

                    if (targetIndex !== this.draggingIndex) {
                        const item = this.loraRows.splice(this.draggingIndex, 1)[0];
                        this.loraRows.splice(targetIndex, 0, item);
                        this.syncData();
                        this.updateUI();
                    }
                    
                    this.draggingIndex = null;
                    this.dragCurrentY = null;
                    if (this.graph) this.graph.setDirtyCanvas(true, true);
                    return true;
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

                const existingMenu = document.getElementById("rayko-lora-loader-selector-menu");
                if (existingMenu) existingMenu.remove();

                const menu = document.createElement("div");
                menu.id = "rayko-lora-loader-selector-menu";
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

            nodeType.prototype.showLoraInfo = function(loraName) {
                const existingPopup = document.getElementById("rayko-lora-info-popup");
                if (existingPopup) existingPopup.remove();
                
                const popup = document.createElement("div");
                popup.id = "rayko-lora-info-popup";
                popup.style.cssText = `
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: #1a1a1a; border: 1px solid #444; border-radius: 8px; padding: 20px;
                    max-width: 500px; max-height: 400px; overflow-y: auto; z-index: 100001;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.8); font-family: sans-serif;
                `;
                
                const header = document.createElement("div");
                header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #333;`;
                
                const title = document.createElement("div");
                title.textContent = "LoRA Info";
                title.style.cssText = `color: #fff; font-size: 16px; font-weight: bold;`;
                
                const closeBtn = document.createElement("button");
                closeBtn.textContent = "✕";
                closeBtn.style.cssText = `background: transparent; border: none; color: #888; font-size: 20px; cursor: pointer; padding: 0 5px; line-height: 1;`;
                closeBtn.onmouseenter = () => closeBtn.style.color = "#fff";
                closeBtn.onmouseleave = () => closeBtn.style.color = "#888";
                closeBtn.onclick = () => { popup.remove(); document.removeEventListener("keydown", handleEsc); };
                
                header.appendChild(title);
                header.appendChild(closeBtn);
                popup.appendChild(header);
                
                const fullNameLabel = document.createElement("div");
                fullNameLabel.textContent = "Full Name:";
                fullNameLabel.style.cssText = `color: #888; font-size: 12px; margin-bottom: 5px;`;
                
                const fullName = document.createElement("div");
                fullName.textContent = loraName;
                fullName.style.cssText = `color: #fff; font-size: 13px; background: #2a2a2a; padding: 8px; border-radius: 4px; margin-bottom: 15px; word-break: break-all;`;
                
                popup.appendChild(fullNameLabel);
                popup.appendChild(fullName);
                
                const content = document.createElement("div");
                content.style.cssText = `color: #999; font-size: 13px; text-align: center; padding: 20px;`;
                content.textContent = "Loading...";
                popup.appendChild(content);
                
                const sourceLabel = document.createElement("div");
                sourceLabel.style.cssText = `color: #666; font-size: 10px; text-align: right; margin-top: 10px; font-style: italic;`;
                popup.appendChild(sourceLabel);
                
                document.body.appendChild(popup);
                
                const handleEsc = (e) => { if (e.key === "Escape") { popup.remove(); document.removeEventListener("keydown", handleEsc); } };
                document.addEventListener("keydown", handleEsc);
                
                const updateContent = (data) => {
                    content.innerHTML = "";
                    sourceLabel.textContent = `Source: ${data.source || 'unknown'}`;
                    
                    if (data.error) {
                        content.textContent = data.message || "No metadata available";
                        content.style.color = "#f44336";
                        return;
                    }
                    
                    if (data.full_name && data.full_name !== loraName) {
                        fullName.textContent = data.full_name;
                    }
                    
                    if (data.trained_words && data.trained_words.length > 0) {
                        const twLabel = document.createElement("div");
                        twLabel.textContent = "Trained Words:";
                        twLabel.style.cssText = `color: #888; font-size: 12px; margin-bottom: 8px;`;
                        content.appendChild(twLabel);
                        
                        const twContainer = document.createElement("div");
                        twContainer.style.cssText = `display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 15px;`;
                        
                        data.trained_words.forEach(word => {
                            const chip = document.createElement("div");
                            chip.textContent = word;
                            chip.style.cssText = `background: #2a3a2a; color: #4CAF50; padding: 4px 10px; border-radius: 12px; font-size: 11px; border: 1px solid #4CAF50; cursor: pointer; user-select: none;`;
                            chip.onmouseenter = () => { chip.style.background = "#3a5a3a"; chip.style.borderColor = "#66dd66"; };
                            chip.onmouseleave = () => { chip.style.background = "#2a3a2a"; chip.style.borderColor = "#4CAF50"; };
                            chip.onclick = () => {
                                navigator.clipboard.writeText(word).then(() => {
                                    showRaykoToast(`Copied: "${word}"`, "success", this);
                                    popup.remove();
                                    document.removeEventListener("keydown", handleEsc);
                                }).catch(() => showRaykoToast("Failed to copy", "error", this));
                            };
                            twContainer.appendChild(chip);
                        });
                        content.appendChild(twContainer);
                        
                        const copyBtn = document.createElement("button");
                        copyBtn.textContent = "📋 Copy All";
                        copyBtn.style.cssText = `background: #1a3a5a; color: #aadaff; border: 1px solid #5090cc; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 11px; margin-bottom: 15px;`;
                        copyBtn.onmouseenter = () => copyBtn.style.background = "#2a4a6a";
                        copyBtn.onmouseleave = () => copyBtn.style.background = "#1a3a5a";
                        copyBtn.onclick = () => {
                            const text = data.trained_words.join(", ");
                            navigator.clipboard.writeText(text).then(() => {
                                showRaykoToast("Trained words copied!", "success", this);
                                popup.remove();
                                document.removeEventListener("keydown", handleEsc);
                            }).catch(() => showRaykoToast("Failed to copy", "error", this));
                        };
                        content.appendChild(copyBtn);
                    }
                    
                    if (data.description) {
                        const descLabel = document.createElement("div");
                        descLabel.textContent = "Description:";
                        descLabel.style.cssText = `color: #888; font-size: 12px; margin-bottom: 5px;`;
                        content.appendChild(descLabel);
                        
                        const desc = document.createElement("div");
                        desc.textContent = data.description;
                        desc.style.cssText = `color: #ccc; font-size: 12px; background: #2a2a2a; padding: 8px; border-radius: 4px; line-height: 1.4;`;
                        content.appendChild(desc);
                    }
                    
                    if (!data.trained_words?.length && !data.description) {
                        content.textContent = "No metadata available";
                        content.style.color = "#888";
                    }
                    
                    const actionsDiv = document.createElement("div");
                    actionsDiv.style.cssText = `display: flex; gap: 8px; margin-top: 15px; flex-wrap: wrap;`;
                    
                    const fetchBtn = document.createElement("button");
                    fetchBtn.textContent = "🌐 Fetch from Civitai";
                    fetchBtn.style.cssText = `flex: 1; background: #3a2a1a; color: #fbbf24; border: 1px solid #fbbf24; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 11px;`;
                    fetchBtn.onmouseenter = () => fetchBtn.style.background = "#4a3a2a";
                    fetchBtn.onmouseleave = () => fetchBtn.style.background = "#3a2a1a";
                    fetchBtn.onclick = async () => {
                        fetchBtn.textContent = "⏳ Loading...";
                        fetchBtn.disabled = true;
                        fetchBtn.style.opacity = "0.5";
                        
                        try {
                            const res = await fetch("/rayko_lora_loader/fetch_civitai_info", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name: loraName })
                            });
                            const result = await res.json();
                            if (result.error) {
                                content.textContent = result.message || "Error fetching from Civitai";
                                content.style.color = "#f44336";
                                sourceLabel.textContent = "";
                            } else {
                                updateContent(result);
                            }
                        } catch (err) {
                            content.textContent = "Network error";
                            content.style.color = "#f44336";
                            sourceLabel.textContent = "";
                        }
                    };
                    actionsDiv.appendChild(fetchBtn);
                    
                    content.appendChild(actionsDiv);
                };
                
                fetch("/rayko_lora_loader/get_lora_info", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: loraName })
                })
                .then(res => res.json())
                .then(updateContent)
                .catch(err => {
                    content.textContent = "Error loading metadata";
                    content.style.color = "#f44336";
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
                if (node.type === "RaykoLoRALoader" && node.restoreData) {
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
                if (node.type === "RaykoLoRALoader" && node.restoreData) {
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
            folderHeader.innerHTML = `<span style="margin-right:8px;">${isExpanded ? "▼" : "▶"}</span>  ${name}`;
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