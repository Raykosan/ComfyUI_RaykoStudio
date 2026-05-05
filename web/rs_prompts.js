import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_CLASS = "RSPrompts";
let pendingDeleteName = null;

const styleBlock = document.createElement('style');
styleBlock.innerHTML = `
    textarea.comfy-multiline-input { opacity: 1 !important; color: #fff !important; text-shadow: none !important; }
    textarea.comfy-multiline-input:disabled { opacity: 0.5 !important; color: #888 !important; }
    .rs-waiting-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        border-radius: 8px;
    }
    .rs-waiting-message {
        background: #2a2a2a;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #5090cc;
        text-align: center;
    }
    .rs-toggle-switch {
        position: relative;
        display: inline-flex;
        align-items: center;
        cursor: pointer;
        gap: 6px;
    }
    .rs-toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
        position: absolute;
    }
    .rs-toggle-slider {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 18px;
        background-color: #444;
        border-radius: 18px;
        transition: 0.3s;
        cursor: pointer;
    }
    .rs-toggle-slider:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 2px;
        bottom: 2px;
        background-color: white;
        border-radius: 50%;
        transition: 0.3s;
    }
    input:checked + .rs-toggle-slider {
        background-color: #28a745;
    }
    input:checked + .rs-toggle-slider:before {
        transform: translateX(18px);
    }
    .rs-toggle-label {
        font-size: 11px;
        color: #ccc;
        user-select: none;
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
        
        nodeType.prototype.onNodeCreated = function () {
            const result = origOnNodeCreated?.apply(this, arguments);
            const node = this;

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

            const textWidget = node.widgets?.find(w => w.name === "text");
            const pauseWidget = node.widgets?.find(w => w.name === "pause_for_edit");
            const disableWidget = node.widgets?.find(w => w.name === "disable_text_input");
            
            if (pauseWidget) {
                pauseWidget.hidden = true;
            }
            
            if (disableWidget) {
                disableWidget.hidden = true;
            }
            
            if (textWidget) textWidget.hidden = true;

            const enableWidgets = () => {
                if (textWidget) {
                    textWidget.disabled = false;
                    textWidget.serializeValue = () => textWidget.value;
                }
            };
            setTimeout(enableWidgets, 50);

            const origOnConnectionsChange = node.onConnectionsChange;
            node.onConnectionsChange = function(slotType, slotIndex, isConnected, link, linkInfo) {
                if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);
                setTimeout(enableWidgets, 50);
                setTimeout(() => updateStatusIndicator(), 10);
                setTimeout(() => {
                    if (pauseModeEnabled && !canPauseBeActive()) {
                        pauseModeEnabled = false;
                        if (pauseWidget) pauseWidget.value = false;
                        updateUIForPauseMode(false);
                    }
                }, 10);
            };

            let waitingOverlay = null;
            let pauseModeEnabled = false;
            
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
                    <div style="color:#aadaff; font-size:14px; margin-bottom:10px;">✏️ EDITING MODE</div>
                    <div style="color:#ccc; font-size:12px;">Edit the prompt below and click APPROVE</div>
                    <div style="color:#666; font-size:10px; margin-top:8px;">⏳ Waiting for your decision...</div>
                `;
                waitingOverlay.appendChild(messageDiv);
                const domWidget = node.domWidgets?.find(w => w.name === "prompt_ui");
                if (domWidget && domWidget.element) {
                    domWidget.element.style.position = "relative";
                    domWidget.element.appendChild(waitingOverlay);
                }
            };

            const root = mkEl("div", "display:flex;flex-direction:column;height:100%;padding:0;margin:0;box-sizing:border-box;overflow:hidden;position:relative;");
            
            const disableRow = mkEl("div", "display:flex;align-items:center;justify-content:flex-start;padding:4px 6px 2px 6px;background:#1a1a1a;");
            const disableToggleContainer = mkEl("label", "rs-toggle-switch");
            const disableToggleInput = document.createElement("input");
            disableToggleInput.type = "checkbox";
            const disableToggleSlider = mkEl("span", "rs-toggle-slider");
            const disableToggleLabel = mkEl("span", "rs-toggle-label");
            disableToggleLabel.textContent = "🔘 Disable text input";
            
            disableToggleContainer.appendChild(disableToggleInput);
            disableToggleContainer.appendChild(disableToggleSlider);
            disableToggleContainer.appendChild(disableToggleLabel);
            disableRow.appendChild(disableToggleContainer);
            
            const pauseRow = mkEl("div", "display:flex;align-items:center;justify-content:space-between;padding:2px 6px 4px 6px;background:#1a1a1a;border-bottom:1px solid #333;gap:4px;");
            
            const toggleContainer = mkEl("label", "rs-toggle-switch");
            const toggleInput = document.createElement("input");
            toggleInput.type = "checkbox";
            const toggleSlider = mkEl("span", "rs-toggle-slider");
            const toggleLabel = mkEl("span", "rs-toggle-label");
            toggleLabel.textContent = "⏸️ Pause for edit";
            
            toggleContainer.appendChild(toggleInput);
            toggleContainer.appendChild(toggleSlider);
            toggleContainer.appendChild(toggleLabel);
            
            const statusIndicator = mkEl("div", "font-size:10px;padding:2px 6px;border-radius:4px;background:#2a2a2a;color:#ccc;");
            statusIndicator.textContent = "📝 Local prompt";
            
            pauseRow.appendChild(toggleContainer);
            pauseRow.appendChild(statusIndicator);
            
            root.appendChild(disableRow);
            root.appendChild(pauseRow);
            
            const customTextarea = document.createElement("textarea");
            customTextarea.className = "rs-custom-textarea";
            customTextarea.style.cssText = "flex:1;width:100%;min-height:0;border:none;border-radius:4px;padding:8px;background:#111;color:#fff;font-family:system-ui,sans-serif;font-size:12px;resize:none;outline:none;box-sizing:border-box;";
            customTextarea.placeholder = "Enter your prompt here...";
            
            const storageKey = `rs_prompt_${node.id}`;
            
            if (textWidget) {
                const savedValue = localStorage.getItem(storageKey);
                if (savedValue && !textWidget.value) {
                    textWidget.value = savedValue;
                }
                customTextarea.value = textWidget.value || "";
                textWidget.value = customTextarea.value;
            } else {
                const savedValue = localStorage.getItem(storageKey);
                if (savedValue) {
                    customTextarea.value = savedValue;
                }
            }
            
            customTextarea.addEventListener("input", () => {
                if (textWidget) {
                    textWidget.value = customTextarea.value;
                }
                localStorage.setItem(storageKey, customTextarea.value);
                node.graph?.setDirtyCanvas(true, true);
            });
            
            root.appendChild(customTextarea);

            const buttonsWrapper = mkEl("div", "width:100%;display:flex;flex-direction:column;gap:4px;padding:4px;box-sizing:border-box;");
            
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
            
            acceptEditBtn.disabled = true;
            acceptEditBtn.style.opacity = "0.5";
            acceptEditBtn.style.cursor = "not-allowed";
            rejectEditBtn.disabled = true;
            rejectEditBtn.style.opacity = "0.5";
            rejectEditBtn.style.cursor = "not-allowed";

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

            const canPauseBeActive = () => {
                const hasConnection = hasTextInputConnection();
                const isDisabled = disableToggleInput.checked;
                return hasConnection && !isDisabled;
            };

            const updateStatusIndicator = () => {
                if (pauseModeEnabled) {
                    statusIndicator.innerHTML = `<span style='color:#28a745'>⏸️ WAITING FOR EDIT</span>`;
                    statusIndicator.style.background = "#1a3a1a";
                    return;
                }
                
                const hasConnection = hasTextInputConnection();
                const isDisabled = disableToggleInput.checked;
                
                if (!hasConnection) {
                    statusIndicator.innerHTML = `<span style='color:#aadaff'>📝 Local prompt</span>`;
                } else if (hasConnection && !isDisabled) {
                    statusIndicator.innerHTML = `<span style='color:#aadaff'>🔌 External input</span>`;
                } else if (hasConnection && isDisabled) {
                    statusIndicator.innerHTML = `<span style='color:#aadaff'>📝 Local prompt</span>`;
                }
                
                statusIndicator.style.background = "#2a2a2a";
            };

            const updateUIForPauseMode = (isPaused) => {
                if (isPaused) {
                    clearBtn.disabled = true;
                    clearBtn.style.opacity = "0.5";
                    clearBtn.style.cursor = "not-allowed";
                    saveBtn.disabled = true;
                    saveBtn.style.opacity = "0.5";
                    saveBtn.style.cursor = "not-allowed";
                    selectBtn.disabled = true;
                    selectBtn.style.opacity = "0.5";
                    selectBtn.style.cursor = "not-allowed";
                    
                    acceptEditBtn.disabled = false;
                    acceptEditBtn.style.opacity = "1";
                    acceptEditBtn.style.cursor = "pointer";
                    rejectEditBtn.disabled = false;
                    rejectEditBtn.style.opacity = "1";
                    rejectEditBtn.style.cursor = "pointer";
                    
                    customTextarea.style.border = "2px solid #28a745";
                    
                    updateStatusIndicator();
                    
                    showWaitingOverlay();
                } else {
                    clearBtn.disabled = false;
                    clearBtn.style.opacity = "1";
                    clearBtn.style.cursor = "pointer";
                    saveBtn.disabled = false;
                    saveBtn.style.opacity = "1";
                    saveBtn.style.cursor = "pointer";
                    selectBtn.disabled = false;
                    selectBtn.style.opacity = "1";
                    selectBtn.style.cursor = "pointer";
                    
                    acceptEditBtn.disabled = true;
                    acceptEditBtn.style.opacity = "0.5";
                    acceptEditBtn.style.cursor = "not-allowed";
                    rejectEditBtn.disabled = true;
                    rejectEditBtn.style.opacity = "0.5";
                    rejectEditBtn.style.cursor = "not-allowed";
                    
                    customTextarea.style.border = "1px solid #444";
                    
                    updateStatusIndicator();
                    
                    removeWaitingOverlay();
                }
            };
            
            if (disableWidget) {
                disableToggleInput.checked = disableWidget.value;
                
                if (disableToggleInput.checked) {
                    disableToggleLabel.textContent = "🔴 Disable text input";
                } else {
                    disableToggleLabel.textContent = "🔘 Disable text input";
                }
                
                updateStatusIndicator();
                
                disableToggleInput.addEventListener("change", (e) => {
                    disableWidget.value = e.target.checked;
                    if (disableWidget.callback) disableWidget.callback(e.target.checked);
                    
                    if (e.target.checked) {
                        disableToggleLabel.textContent = "🔴 Disable text input";
                    } else {
                        disableToggleLabel.textContent = "🔘 Disable text input";
                    }
                    
                    if (pauseModeEnabled && !canPauseBeActive()) {
                        pauseModeEnabled = false;
                        if (pauseWidget) pauseWidget.value = false;
                        toggleInput.checked = false;
                        updateUIForPauseMode(false);
                    }
                    
                    updateStatusIndicator();
                    
                    node.graph?.setDirtyCanvas(true, true);
                });
            }
            
            if (pauseWidget) {
                toggleInput.checked = pauseWidget.value;
            }
            
            toggleInput.addEventListener("change", (e) => {
                if (pauseWidget) {
                    pauseWidget.value = e.target.checked;
                    if (pauseWidget.callback) pauseWidget.callback(e.target.checked);
                }
                node.graph?.setDirtyCanvas(true, true);
            });

            acceptEditBtn.addEventListener("click", async () => {
                const currentPrompt = customTextarea.value;
                await fetch("/rs_prompts/approve_edit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        node_id: node.id.toString(),
                        prompt: currentPrompt
                    })
                });
                pauseModeEnabled = false;
                updateUIForPauseMode(false);
                node.graph?.setDirtyCanvas(true, true);
            });
            
            rejectEditBtn.addEventListener("click", async () => {
                await fetch("/rs_prompts/reject_edit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        node_id: node.id.toString()
                    })
                });
                pauseModeEnabled = false;
                updateUIForPauseMode(false);
                node.graph?.setDirtyCanvas(true, true);
            });

            clearBtn.addEventListener("click", () => {
                if(textWidget) {
                    textWidget.value = "";
                    customTextarea.value = "";
                    localStorage.setItem(storageKey, "");
                    node.graph?.setDirtyCanvas(true, true);
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
            inputCancel.addEventListener("click", () => { presetNameInput.style.display = "none"; }); 
            inputField.addEventListener("keydown", (e) => { if(e.key === "Enter") performSave(); if(e.key === "Escape") presetNameInput.style.display = "none"; });

            selectBtn.addEventListener("click", async () => {
                presetNameInput.style.display = "none";
                deleteConfirmOverlay.style.display = "none";
                if (presetListOverlay.style.display === "flex") { presetListOverlay.style.display = "none"; return; }
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
                        nameSpan.textContent = name; nameSpan.style.cssText = "flex:1;cursor:pointer;color:#ccc;font-size:12px;";
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
                                    localStorage.setItem(storageKey, data.text || "");
                                }
                                node.graph?.setDirtyCanvas(true, true);
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
                } catch(e) { presetListOverlay.textContent = "Error loading"; }
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
                if (event.detail.node_id == node.id) {
                    customTextarea.value = event.detail.prompt;
                    if (textWidget) textWidget.value = event.detail.prompt;
                    localStorage.setItem(storageKey, event.detail.prompt);
                    if (canPauseBeActive()) {
                        pauseModeEnabled = true;
                        toggleInput.checked = true;
                        if (pauseWidget) pauseWidget.value = true;
                        updateUIForPauseMode(true);
                    }
                    node.graph?.setDirtyCanvas(true, true);
                }
            });

            api.addEventListener("rs.prompt.update", (event) => {
                if (event.detail.node_id == node.id) {
                    setTimeout(() => {
                        customTextarea.value = event.detail.prompt;
                        if (textWidget) textWidget.value = event.detail.prompt;
                        localStorage.setItem(storageKey, event.detail.prompt);
                        node.graph?.setDirtyCanvas(true, true);
                    }, 10);
                }
            });
            
            window.addEventListener("beforeunload", () => {
                if (textWidget && textWidget.value) {
                    localStorage.setItem(storageKey, textWidget.value);
                } else if (customTextarea.value) {
                    localStorage.setItem(storageKey, customTextarea.value);
                }
            });
            
            updateUIForPauseMode(false);
            
            return result;
        };
    }
});