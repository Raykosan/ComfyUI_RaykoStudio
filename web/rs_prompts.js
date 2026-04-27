import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_CLASS = "RSPrompts";
let pendingDeleteName = null;

function mkEl(tag, css) { const el = document.createElement(tag); if (css) el.style.cssText = css; return el; }

app.registerExtension({
    name: "RSPrompts",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function () {
            const result = origOnNodeCreated?.apply(this, arguments);
            const node = this;
            
            const widgets = {
                positive: node.widgets.find(w => w.name === "Positive prompt"),
                negative: node.widgets.find(w => w.name === "Negative prompt")
            };

            const root = mkEl("div", "display:flex;flex-direction:column;gap:2px;padding:0px 4px 4px 4px;width:100%;box-sizing:border-box;position:relative;margin-top:0px;");
            
            const clearRow = mkEl("div", "display:flex;gap:4px;width:100%;");
            const clearPosBtn = mkEl("button", "flex:1;padding:4px 2px;font-size:10px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;");
            clearPosBtn.textContent = "❌ Clear Positive";
            const clearNegBtn = mkEl("button", "flex:1;padding:4px 2px;font-size:10px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;");
            clearNegBtn.textContent = "❌ Clear Negative";
            clearRow.append(clearPosBtn, clearNegBtn);

            const btnRow = mkEl("div", "display:flex;gap:4px;width:100%;");
            const saveBtn = mkEl("button", "flex:1;padding:6px 2px;font-size:11px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;"); 
            saveBtn.textContent = "💾 Save prompt";
            
            const selectBtn = mkEl("button", "flex:1;padding:6px 2px;font-size:11px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;"); 
            selectBtn.textContent = "📂 Select prompt";

            btnRow.append(saveBtn, selectBtn);
            root.append(clearRow, btnRow);

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
            node.setSize([370, 280]);
            node.min_height = 280;
            node.min_width = 370;

            clearPosBtn.addEventListener("click", () => {
                if(widgets.positive) {
                    widgets.positive.value = "";
                    node.graph?.setDirtyCanvas(true, true);
                }
            });

            clearNegBtn.addEventListener("click", () => {
                if(widgets.negative) {
                    widgets.negative.value = "";
                    node.graph?.setDirtyCanvas(true, true);
                }
            });

            saveBtn.addEventListener("click", () => { 
                presetListOverlay.style.display = "none"; 
                deleteConfirmOverlay.style.display = "none";
                presetNameInput.style.display = "block"; 
                inputField.value = ""; 
                inputField.focus(); 
            });
            
            const performSave = () => { 
                const name = inputField.value.trim(); 
                if (!name) return; 
                presetNameInput.style.display = "none";
                
                fetch("/rs_prompts/save_prompt", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        name, 
                        positive: widgets.positive ? widgets.positive.value : "", 
                        negative: widgets.negative ? widgets.negative.value : "" 
                    })
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
                        nameSpan.onmouseenter = () => nameSpan.style.background = "#3a3a3a"; nameSpan.onmouseleave = () => nameSpan.style.background = "transparent";
                        nameSpan.onclick = async () => {
                            presetListOverlay.style.display = "none";
                            const res2 = await fetch("/rs_prompts/load_prompt", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name }) });
                            if(res2.ok) {
                                const data = await res2.json();
                                if(widgets.positive) widgets.positive.value = data.positive || "";
                                if(widgets.negative) widgets.negative.value = data.negative || "";
                                node.graph?.setDirtyCanvas(true, true);
                            }
                        };
                        const deleteBtn = document.createElement("span");
                        deleteBtn.textContent = "❌"; deleteBtn.style.cssText = "cursor:pointer;margin-left:8px;font-size:14px;opacity:0.7;";
                        deleteBtn.onmouseenter = () => { deleteBtn.style.opacity = "1"; deleteBtn.style.transform = "scale(1.2)"; };
                        deleteBtn.onmouseleave = () => { deleteBtn.style.opacity = "0.7"; deleteBtn.style.transform = "scale(1)"; };
                        deleteBtn.onclick = async (e) => {
                            e.stopPropagation();
                            pendingDeleteName = name;
                            deleteText.textContent = `Delete "${name}"?`;
                            deleteConfirmOverlay.style.display = "block";
                        };
                        row.appendChild(nameSpan); row.appendChild(deleteBtn);
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

            return result;
        };
    }
});