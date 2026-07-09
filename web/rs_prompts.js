import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_CLASS = "RSPrompts";
let pendingDeleteName = null;

const styleBlock = document.createElement('style');
styleBlock.innerHTML = `
    .rs-custom-textarea {
        flex: 1;
        width: 100%;
        min-height: 0;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 8px;
        background: #111;
        color: #fff;
        font-family: system-ui, sans-serif;
        font-size: 12px;
        resize: none;
        outline: none;
        box-sizing: border-box;
    }
    
    body.light-mode .rs-custom-textarea {
        background: #fff;
        color: #000;
        border-color: #ccc;
    }
    
    html[data-theme="light"] .rs-custom-textarea {
        background: #fff;
        color: #000;
        border-color: #ccc;
    }
    
    .rs-waiting-overlay {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000; border-radius: 8px;
    }
    .rs-waiting-message {
        background: #2a2a2a; padding: 20px; border-radius: 8px;
        border: 1px solid #fbbf24; text-align: center;
    }
`;
document.head.appendChild(styleBlock);

function mkEl(tag, css) { 
    const el = document.createElement(tag); 
    if (css) el.style.cssText = css; 
    return el; 
}

app.registerExtension({
    name: "RSPrompts",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        const origOnConfigure = nodeType.prototype.onConfigure;
        const origSerialize = nodeType.prototype.serialize;
        const origOnRemoved = nodeType.prototype.onRemoved;
        
        nodeType.prototype.onConfigure = function(data) {
            const result = origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;
            
            if (this.properties?.rs_instance_uid && this.widgets) {
                const uidWidget = this.widgets.find(w => w.name === "instance_uid");
                if (uidWidget) {
                    uidWidget.value = this.properties.rs_instance_uid;
                }
            }
            
            if (this.widgets) {
                const pauseWidget = this.widgets.find(w => w.name === "pause_for_edit");
                const disableWidget = this.widgets.find(w => w.name === "disable_text_input");
                
                if (pauseWidget && this.properties?.rs_pause_state !== undefined) {
                    pauseWidget.value = this.properties.rs_pause_state;
                }
                if (disableWidget && this.properties?.rs_disable_state !== undefined) {
                    disableWidget.value = this.properties.rs_disable_state;
                }
            }
            
            setTimeout(() => {
                if (this.restoreFromProperties) {
                    this.restoreFromProperties();
                }
            }, 100);
            
            return result;
        };
        
        nodeType.prototype.serialize = function() {
            if (this.properties && this.widgets) {
                const uidWidget = this.widgets.find(w => w.name === "instance_uid");
                if (uidWidget && uidWidget.value) {
                    this.properties.rs_instance_uid = uidWidget.value;
                }
            }
            
            if (this.widgets) {
                const pauseWidget = this.widgets.find(w => w.name === "pause_for_edit");
                const disableWidget = this.widgets.find(w => w.name === "disable_text_input");
                
                if (pauseWidget && this.properties) {
                    this.properties.rs_pause_state = pauseWidget.value;
                }
                if (disableWidget && this.properties) {
                    this.properties.rs_disable_state = disableWidget.value;
                }
            }
            
            const result = origSerialize ? origSerialize.apply(this, arguments) : {};
            return result;
        };
        
        nodeType.prototype.onNodeCreated = function () {
            const result = origOnNodeCreated?.apply(this, arguments);
            const node = this;

            if (!node.properties) {
                node.properties = {};
            }
            
            let instanceUid = node.properties.rs_instance_uid;
            
            if (!instanceUid) {
                const uidWidget = node.widgets?.find(w => w.name === "instance_uid");
                if (uidWidget && uidWidget.value) {
                    instanceUid = uidWidget.value;
                } else {
                    instanceUid = 'rs_inst_' + crypto.randomUUID().replace(/-/g, '');
                }
                node.properties.rs_instance_uid = instanceUid;
            }
            
            if (node.properties.rs_pause_state === undefined) {
                const pauseWidget = node.widgets?.find(w => w.name === "pause_for_edit");
                node.properties.rs_pause_state = pauseWidget ? pauseWidget.value : false;
            }
            if (node.properties.rs_disable_state === undefined) {
                const disableWidget = node.widgets?.find(w => w.name === "disable_text_input");
                node.properties.rs_disable_state = disableWidget ? disableWidget.value : false;
            }
            if (node.properties.rs_is_waiting === undefined) {
                node.properties.rs_is_waiting = false;
            }
            if (node.properties.rs_waiting_prompt === undefined) {
                node.properties.rs_waiting_prompt = "";
            }
            if (node.properties.rs_waiting_timestamp === undefined) {
                node.properties.rs_waiting_timestamp = 0;
            }

            const textWidget = node.widgets?.find(w => w.name === "text");
            const pauseWidget = node.widgets?.find(w => w.name === "pause_for_edit");
            const disableWidget = node.widgets?.find(w => w.name === "disable_text_input");
            const uidWidget = node.widgets?.find(w => w.name === "instance_uid");
            
            if (uidWidget) {
                uidWidget.value = instanceUid;
                uidWidget.hidden = true;
                uidWidget.serializeValue = () => node.properties.rs_instance_uid;
            }
            if (textWidget) {
                textWidget.hidden = true;
            }

            if (pauseWidget) {
                pauseWidget.value = node.properties.rs_pause_state;
            }
            if (disableWidget) {
                disableWidget.value = node.properties.rs_disable_state;
            }

            const hidePhantomSlot = () => {
                if (node.inputs) {
                    const textInput = node.inputs.find(i => i.name === "text");
                    if (textInput) {
                        textInput.disabled = true;
                        textInput.color_on = "transparent";
                        textInput.color_off = "transparent";
                        textInput.pos = [-1000, -1000];
                    }
                }
            };
            setTimeout(hidePhantomSlot, 0);

            let waitingOverlay = null;
            let enforcementInterval = null;
            
            const removeWaitingOverlay = () => {
                if (waitingOverlay && waitingOverlay.parentNode) {
                    waitingOverlay.remove();
                    waitingOverlay = null;
                }
            };
            
            const showWaitingOverlay = () => {
                removeWaitingOverlay();
                waitingOverlay = mkEl("div", "rs-waiting-overlay");
                const messageDiv = mkEl("div", "rs-waiting-message");
                messageDiv.innerHTML = `
                    <div style="color:#fbbf24; font-size:14px; margin-bottom:10px; font-weight:bold;">✏️ EDITING MODE</div>
                    <div style="color:#ccc; font-size:12px;">Edit the prompt below and click APPROVE</div>
                    <div style="color:#888; font-size:10px; margin-top:8px;">⏳ Waiting for your decision...</div>
                `;
                waitingOverlay.appendChild(messageDiv);
                const domWidget = node.domWidgets?.find(w => w.name === "prompt_ui");
                if (domWidget && domWidget.element) {
                    domWidget.element.style.position = "relative";
                    domWidget.element.appendChild(waitingOverlay);
                }
            };

            const root = mkEl("div", "display:flex;flex-direction:column;height:100%;padding:0;margin:0;box-sizing:border-box;overflow:hidden;position:relative;");
            
            const statusBar = mkEl("div", "width:100%; padding: 4px 8px; font-size: 11px; font-weight: bold; text-align: center; border-radius: 4px 4px 0 0; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 6px; line-height: 1.2;");
            root.appendChild(statusBar);
            
            const customTextarea = document.createElement("textarea");
            customTextarea.className = "rs-custom-textarea";
            customTextarea.style.cssText = "flex:1;width:100%;min-height:0;resize:none;outline:none;box-sizing:border-box;";
            customTextarea.placeholder = "Enter your prompt here...";
            root.appendChild(customTextarea);

            const buttonsWrapper = mkEl("div", "width:100%;display:flex;flex-direction:column;gap:4px;padding:4px;box-sizing:border-box;margin-top:4px;");
            
            const clearRow = mkEl("div", "display:flex;gap:4px;width:100%;");
            const clearBtn = mkEl("button", "flex:1;padding:6px 2px;font-size:11px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;");
            clearBtn.textContent = "❌ Clear prompt";
            clearRow.append(clearBtn);

            const btnRow = mkEl("div", "display:flex;gap:4px;width:100%;");
            const saveBtn = mkEl("button", "flex:1;padding:6px 2px;font-size:11px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;"); 
            saveBtn.textContent = "💾 Save prompt";
            const selectBtn = mkEl("button", "flex:1;padding:6px 2px;font-size:11px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;"); 
            selectBtn.textContent = "📂 Select prompt";
            btnRow.append(saveBtn, selectBtn);
            
            const actionRow = mkEl("div", "display:flex;gap:4px;width:100%;margin-top:2px;");
            const acceptEditBtn = mkEl("button", "flex:1;padding:6px 2px;font-size:11px;border:1px solid #28a745;border-radius:5px;background:#1a3a1a;color:#aaffaa;cursor:pointer;transition:all 0.2s;");
            acceptEditBtn.textContent = "✔️ APPROVE & CONTINUE";
            const rejectEditBtn = mkEl("button", "flex:1;padding:6px 2px;font-size:11px;border:1px solid #dc3545;border-radius:5px;background:#3a1a1a;color:#ffaaaa;cursor:pointer;transition:all 0.2s;");
            rejectEditBtn.textContent = "❌ REJECT (use original)";
            actionRow.append(acceptEditBtn, rejectEditBtn);
            
            buttonsWrapper.append(clearRow, btnRow, actionRow);
            root.appendChild(buttonsWrapper);

            const presetListOverlay = mkEl("div", "position:absolute;display:none;top:50%;left:50%;transform:translate(-50%, -50%);flex-direction:column;max-height:200px;overflow-y:auto;background:#2a2a2a;border:1px solid #5090cc;border-radius:6px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.8);min-width:180px;padding:5px;");
            const presetNameInput = mkEl("div", "position:absolute;display:none;top:50%;left:50%;transform:translate(-50%, -50%);background:#2a2a2a;padding:10px;border:1px solid #5090cc;border-radius:6px;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.7);width:220px;text-align:center;");
            const inputLabel = mkEl("div", "color:#999;font-size:11px;margin-bottom:4px;text-align:left;");
            inputLabel.textContent = "Prompt name:";
            const inputField = mkEl("input", "width:100%;padding:5px;background:#111;color:#fff;border:1px solid #444;border-radius:3px;margin-bottom:5px;font-size:12px;box-sizing:border-box;");
            const inputBtns = mkEl("div", "display:flex;gap:5px;");
            const inputOk = mkEl("button", "flex:1;padding:4px;background:#1a3a5a;color:#aadaff;border:1px solid #5090cc;border-radius:3px;cursor:pointer;font-size:11px;"); inputOk.textContent = "OK";
            const inputCancel = mkEl("button", "flex:1;padding:4px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:3px;cursor:pointer;font-size:11px;"); inputCancel.textContent = "Cancel";
            inputBtns.append(inputOk, inputCancel);
            presetNameInput.append(inputLabel, inputField, inputBtns);

            const deleteConfirmOverlay = mkEl("div", "position:absolute;display:none;top:50%;left:50%;transform:translate(-50%, -50%);background:#2a2a2a;padding:10px;border:1px solid #5090cc;border-radius:6px;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.7);width:220px;text-align:center;");
            const deleteText = mkEl("div", "color:#ccc;font-size:12px;margin-bottom:10px;word-break:break-word;");
            const deleteBtns = mkEl("div", "display:flex;gap:5px;");
            const deleteOk = mkEl("button", "flex:1;padding:4px;background:#1a3a5a;color:#aadaff;border:1px solid #5090cc;border-radius:3px;cursor:pointer;font-size:11px;"); deleteOk.textContent = "OK";
            const deleteCancel = mkEl("button", "flex:1;padding:4px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:3px;cursor:pointer;font-size:11px;"); deleteCancel.textContent = "Cancel";
            deleteBtns.append(deleteOk, deleteCancel);
            deleteConfirmOverlay.append(deleteText, deleteBtns);
            
            root.appendChild(presetListOverlay);
            root.appendChild(presetNameInput);
            root.appendChild(deleteConfirmOverlay);

            node.addDOMWidget("prompt_ui", "custom", root);
            node.setSize([370, 350]);
            node.min_height = 350;
            node.min_width = 370;

            const origOnResize = node.onResize;
            node.onResize = function(size) {
                if (origOnResize) origOnResize.apply(this, [size]);
                if (size[0] < 370) size[0] = 370;
                if (size[1] < 350) size[1] = 350;
            };

            const hasTextInputConnection = () => {
                return node.inputs?.some(i => i.name === "text_input" && i.link !== null) || false;
            };

            const origOnConnectionsChange = node.onConnectionsChange;
            node.onConnectionsChange = function(slotType, slotIndex, isConnected, link, linkInfo) {
                if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);
                updateStatusAndUI();
            };

            const updateStatusAndUI = () => {
                const isWaiting = node.properties.rs_is_waiting;
                const isDisabled = node.properties.rs_disable_state;
                const hasConnection = hasTextInputConnection();

                removeWaitingOverlay();
                
                acceptEditBtn.disabled = true; 
                acceptEditBtn.style.opacity = "0.5"; 
                acceptEditBtn.style.cursor = "not-allowed";
                rejectEditBtn.disabled = true; 
                rejectEditBtn.style.opacity = "0.5"; 
                rejectEditBtn.style.cursor = "not-allowed";
                clearBtn.disabled = false; 
                clearBtn.style.opacity = "1"; 
                clearBtn.style.cursor = "pointer";
                saveBtn.disabled = false; 
                saveBtn.style.opacity = "1"; 
                saveBtn.style.cursor = "pointer";
                selectBtn.disabled = false; 
                selectBtn.style.opacity = "1"; 
                selectBtn.style.cursor = "pointer";
                customTextarea.style.border = "1px solid #444";

                if (isWaiting && hasConnection && !isDisabled) {
                    statusBar.style.background = "#3a2a1a";
                    statusBar.style.color = "#fbbf24";
                    statusBar.innerHTML = "🟠 WAITING FOR EDIT - Edit prompt and click APPROVE";
                    
                    acceptEditBtn.disabled = false; 
                    acceptEditBtn.style.opacity = "1"; 
                    acceptEditBtn.style.cursor = "pointer";
                    rejectEditBtn.disabled = false; 
                    rejectEditBtn.style.opacity = "1"; 
                    rejectEditBtn.style.cursor = "pointer";
                    clearBtn.disabled = true; 
                    clearBtn.style.opacity = "0.5"; 
                    clearBtn.style.cursor = "not-allowed";
                    saveBtn.disabled = true; 
                    saveBtn.style.opacity = "0.5"; 
                    saveBtn.style.cursor = "not-allowed";
                    selectBtn.disabled = true; 
                    selectBtn.style.opacity = "0.5"; 
                    selectBtn.style.cursor = "not-allowed";
                    customTextarea.style.border = "2px solid #fbbf24";
                    
                    showWaitingOverlay();
                } else if (hasConnection && !isDisabled) {
                    statusBar.style.background = "#1a2a3a";
                    statusBar.style.color = "#60a5fa";
                    statusBar.innerHTML = "🔵 EXTERNAL INPUT";
                } else {
                    statusBar.style.background = "#1a3a1a";
                    statusBar.style.color = "#4ade80";
                    statusBar.innerHTML = "🟢 LOCAL PROMPT";
                }
                
                if (node.graph) node.graph.setDirtyCanvas(true, true);
            };

            const startEnforcement = () => {
                if (enforcementInterval) clearInterval(enforcementInterval);
                enforcementInterval = setInterval(() => {
                    let needsRedraw = false;
                    
                    if (pauseWidget && pauseWidget.value !== node.properties.rs_pause_state) {
                        pauseWidget.value = node.properties.rs_pause_state;
                        needsRedraw = true;
                    }
                    if (disableWidget && disableWidget.value !== node.properties.rs_disable_state) {
                        disableWidget.value = node.properties.rs_disable_state;
                        needsRedraw = true;
                    }
                    
                    if (needsRedraw && node.graph) {
                        node.graph.setDirtyCanvas(true, true);
                    }
                }, 200);
            };

            const stopEnforcement = () => {
                if (enforcementInterval) {
                    clearInterval(enforcementInterval);
                    enforcementInterval = null;
                }
            };

            node.onRemoved = function() {
                stopEnforcement();
                if (origOnRemoved) origOnRemoved.apply(this, arguments);
            };

            node.restoreFromProperties = () => {
                const isWaiting = node.properties.rs_is_waiting;
                const waitingPrompt = node.properties.rs_waiting_prompt;
                
                if (isWaiting && waitingPrompt) {
                    customTextarea.value = waitingPrompt;
                    if (textWidget) {
                        textWidget.value = waitingPrompt;
                    }
                    updateStatusAndUI();
                } else {
                    const currentUid = node.properties.rs_instance_uid || node.widgets?.find(w => w.name === "instance_uid")?.value;
                    const textKey = `rs_prompt_${currentUid}`;
                    const savedText = localStorage.getItem(textKey);
                    if (savedText !== null) {
                        customTextarea.value = savedText;
                        if (textWidget) textWidget.value = savedText;
                    }
                    updateStatusAndUI();
                }
            };

            const textKey = `rs_prompt_${instanceUid}`;

            setTimeout(() => {
                if (node.properties.rs_is_waiting && node.properties.rs_waiting_prompt) {
                    customTextarea.value = node.properties.rs_waiting_prompt;
                    if (textWidget) textWidget.value = node.properties.rs_waiting_prompt;
                } else {
                    const savedText = localStorage.getItem(textKey);
                    if (savedText !== null && textWidget) {
                        textWidget.value = savedText;
                        customTextarea.value = savedText;
                    } else if (textWidget) {
                        const initialText = textWidget.value || "";
                        localStorage.setItem(textKey, initialText);
                        customTextarea.value = initialText;
                    }
                }
                
                if (pauseWidget) {
                    const originalPauseCallback = pauseWidget.callback;
                    pauseWidget.callback = function(v) {
                        node.properties.rs_pause_state = v;
                        if (!v) {
                            node.properties.rs_is_waiting = false;
                            node.properties.rs_waiting_prompt = "";
                        }
                        if (originalPauseCallback) originalPauseCallback(v);
                        updateStatusAndUI();
                    };
                }
                
                if (disableWidget) {
                    const originalDisableCallback = disableWidget.callback;
                    disableWidget.callback = function(v) {
                        node.properties.rs_disable_state = v;
                        if (originalDisableCallback) originalDisableCallback(v);
                        updateStatusAndUI();
                    };
                }
                
                startEnforcement();
                updateStatusAndUI();
            }, 100);
            
            customTextarea.addEventListener("input", () => {
                if (textWidget) {
                    textWidget.value = customTextarea.value;
                    const currentUid = node.properties.rs_instance_uid || node.widgets?.find(w => w.name === "instance_uid")?.value;
                    const currentTextKey = `rs_prompt_${currentUid}`;
                    localStorage.setItem(currentTextKey, customTextarea.value);
                    if (node.properties.rs_is_waiting) {
                        node.properties.rs_waiting_prompt = customTextarea.value;
                    }
                }
                if (node.graph) node.graph.setDirtyCanvas(true, true);
            });

            acceptEditBtn.addEventListener("click", async () => {
                const currentUid = node.properties.rs_instance_uid || node.widgets?.find(w => w.name === "instance_uid")?.value;
                if (!currentUid) return;
                
                const currentPrompt = customTextarea.value;
                node.properties.rs_waiting_prompt = currentPrompt;
                
                await fetch("/rs_prompts/approve_edit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        instance_uid: currentUid,
                        prompt: currentPrompt
                    })
                });
                
                node.properties.rs_is_waiting = false;
                node.properties.rs_waiting_prompt = "";
                node.properties.rs_waiting_timestamp = 0;
                updateStatusAndUI();
            });
            
            rejectEditBtn.addEventListener("click", async () => {
                const currentUid = node.properties.rs_instance_uid || node.widgets?.find(w => w.name === "instance_uid")?.value;
                if (!currentUid) return;
                
                await fetch("/rs_prompts/reject_edit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ instance_uid: currentUid })
                });
                
                if (node.properties.rs_waiting_prompt) {
                    customTextarea.value = node.properties.rs_waiting_prompt;
                    if (textWidget) textWidget.value = node.properties.rs_waiting_prompt;
                }
                
                node.properties.rs_is_waiting = false;
                node.properties.rs_waiting_prompt = "";
                node.properties.rs_waiting_timestamp = 0;
                updateStatusAndUI();
            });

            clearBtn.addEventListener("click", () => {
                if(textWidget) {
                    textWidget.value = "";
                    customTextarea.value = "";
                    const currentUid = node.properties.rs_instance_uid || node.widgets?.find(w => w.name === "instance_uid")?.value;
                    const currentTextKey = `rs_prompt_${currentUid}`;
                    localStorage.setItem(currentTextKey, "");
                    if (node.properties.rs_is_waiting) {
                        node.properties.rs_waiting_prompt = "";
                    }
                    if (node.graph) node.graph.setDirtyCanvas(true, true);
                }
            });

            saveBtn.addEventListener("click", () => { 
                presetListOverlay.style.display = "none"; 
                deleteConfirmOverlay.style.display = "none";
                presetNameInput.style.display = "block"; 
                inputField.value = ""; 
                setTimeout(() => inputField.focus(), 50); 
            });
            
            const performSave = () => { 
                const name = inputField.value.trim(); 
                if (!name) return; 
                presetNameInput.style.display = "none";
                fetch("/rs_prompts/save_prompt", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, text: textWidget ? textWidget.value : "" })
                });
            };
            inputOk.addEventListener("click", performSave); 
            inputCancel.addEventListener("click", () => { 
                presetNameInput.style.display = "none"; 
            }); 
            inputField.addEventListener("keydown", (e) => { if(e.key === "Enter") performSave(); if(e.key === "Escape") presetNameInput.style.display = "none"; });

            selectBtn.addEventListener("click", async () => {
                presetNameInput.style.display = "none";
                deleteConfirmOverlay.style.display = "none";
                if (presetListOverlay.style.display === "flex") { 
                    presetListOverlay.style.display = "none"; 
                    return; 
                }
                presetListOverlay.innerHTML = "<div style='padding:8px;color:#999;text-align:center;'>Loading...</div>";
                presetListOverlay.style.display = "flex";
                try {
                    const res = await fetch("/rs_prompts/list_prompts", { method: "POST", headers: {"Content-Type": "application/json"} });
                    const list = await res.json();
                    presetListOverlay.innerHTML = "";
                    if (!list.length) { presetListOverlay.textContent = "No presets found"; return; }
                    list.forEach(name => {
                        const row = document.createElement("div");
                        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #333;";
                        const nameSpan = document.createElement("span");
                        nameSpan.textContent = name; 
                        nameSpan.style.cssText = "flex:1;cursor:pointer;color:#ccc;font-size:12px;";
                        nameSpan.onmouseenter = () => nameSpan.style.background = "#3a3a3a"; 
                        nameSpan.onmouseleave = () => nameSpan.style.background = "transparent";
                        nameSpan.onclick = async () => {
                            presetListOverlay.style.display = "none";
                            const res2 = await fetch("/rs_prompts/load_prompt", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name }) });
                            if(res2.ok) {
                                const data = await res2.json();
                                if(textWidget) {
                                    textWidget.value = data.text || "";
                                    customTextarea.value = data.text || "";
                                    const currentUid = node.properties.rs_instance_uid || node.widgets?.find(w => w.name === "instance_uid")?.value;
                                    const currentTextKey = `rs_prompt_${currentUid}`;
                                    localStorage.setItem(currentTextKey, data.text || "");
                                }
                                if (node.graph) node.graph.setDirtyCanvas(true, true);
                            }
                        };
                        const deleteBtn = document.createElement("span");
                        deleteBtn.textContent = "❌"; 
                        deleteBtn.style.cssText = "cursor:pointer;margin-left:8px;font-size:14px;opacity:0.7;";
                        deleteBtn.onmouseenter = () => { deleteBtn.style.opacity = "1"; deleteBtn.style.transform = "scale(1.2)"; };
                        deleteBtn.onmouseleave = () => { deleteBtn.style.opacity = "0.7"; deleteBtn.style.transform = "scale(1)"; };
                        deleteBtn.onclick = async (e) => {
                            e.stopPropagation();
                            pendingDeleteName = name;
                            deleteText.textContent = `Delete "${name}"?`;
                            deleteConfirmOverlay.style.display = "block";
                        };
                        row.appendChild(nameSpan); 
                        row.appendChild(deleteBtn);
                        presetListOverlay.appendChild(row);
                    });
                } catch(e) { 
                    presetListOverlay.textContent = "Error loading"; 
                }
            });
            
            deleteOk.addEventListener("click", async () => {
                if (pendingDeleteName) {
                    await fetch("/rs_prompts/delete_prompt", { 
                        method: "POST", 
                        headers: {"Content-Type": "application/json"}, 
                        body: JSON.stringify({ name: pendingDeleteName }) 
                    });
                    deleteConfirmOverlay.style.display = "none";
                    selectBtn.click();
                    pendingDeleteName = null;
                }
            });

            deleteCancel.addEventListener("click", () => {
                deleteConfirmOverlay.style.display = "none";
                pendingDeleteName = null;
            });
            
            document.addEventListener("click", (e) => { 
                if (!presetListOverlay?.contains(e.target) && !selectBtn?.contains(e.target)) presetListOverlay.style.display = "none"; 
                if (!presetNameInput?.contains(e.target) && e.target !== saveBtn) presetNameInput.style.display = "none"; 
                if (!deleteConfirmOverlay?.contains(e.target)) deleteConfirmOverlay.style.display = "none";
            });

            api.addEventListener("rs.prompt.pause", (event) => {
                const currentUid = node.properties.rs_instance_uid || node.widgets?.find(w => w.name === "instance_uid")?.value;
                if (event.detail.instance_uid === currentUid) {
                    node.properties.rs_is_waiting = true;
                    node.properties.rs_waiting_prompt = event.detail.prompt;
                    node.properties.rs_waiting_timestamp = Date.now();
                    
                    customTextarea.value = event.detail.prompt;
                    if (textWidget) {
                        textWidget.value = event.detail.prompt;
                        const currentTextKey = `rs_prompt_${currentUid}`;
                        localStorage.setItem(currentTextKey, event.detail.prompt);
                    }
                    updateStatusAndUI();
                }
            });

            api.addEventListener("rs.prompt.update", (event) => {
                const currentUid = node.properties.rs_instance_uid || node.widgets?.find(w => w.name === "instance_uid")?.value;
                if (event.detail.instance_uid === currentUid && !node.properties.rs_is_waiting) {
                    setTimeout(() => {
                        customTextarea.value = event.detail.prompt;
                        if (textWidget) {
                            textWidget.value = event.detail.prompt;
                            const currentTextKey = `rs_prompt_${currentUid}`;
                            localStorage.setItem(currentTextKey, event.detail.prompt);
                        }
                        if (node.graph) node.graph.setDirtyCanvas(true, true);
                    }, 10);
                } else if (event.detail.instance_uid === currentUid && node.properties.rs_is_waiting) {
                    node.properties.rs_waiting_prompt = event.detail.prompt;
                    customTextarea.value = event.detail.prompt;
                    if (textWidget) textWidget.value = event.detail.prompt;
                }
            });
            
            window.addEventListener("beforeunload", () => {
                if (textWidget && textWidget.value) {
                    const currentUid = node.properties.rs_instance_uid || node.widgets?.find(w => w.name === "instance_uid")?.value;
                    const currentTextKey = `rs_prompt_${currentUid}`;
                    localStorage.setItem(currentTextKey, textWidget.value);
                }
                if (pauseWidget) node.properties.rs_pause_state = pauseWidget.value;
                if (disableWidget) node.properties.rs_disable_state = disableWidget.value;
            });
            
            return result;
        };
    }
});