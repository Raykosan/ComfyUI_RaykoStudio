import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.LoadImagesFromDir",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RSLoadImagesFromDir") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function() {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            
            node.data = {
                folder_path: "",
                filter_type: "*.png",
                start_index: 1,
                end_index: 1,
                custom_filter: "*.png"
            };
            
            const filters = ["*.*", "*.png", "*.jpg", "*.jpeg", "*.webp", "*.bmp", "*.gif", "custom"];
            
            const NODE_WIDTH = 260;
            node.targetWidth = NODE_WIDTH;
            
            const MIN_HEIGHT_NORMAL = 255;
            const MIN_HEIGHT_CUSTOM = 280;
            
            node.setSize([NODE_WIDTH, MIN_HEIGHT_NORMAL]);
            node.min_size = [NODE_WIDTH, MIN_HEIGHT_NORMAL];
            
            const wNodeData = node.widgets?.find(w => w.name === "node_data");
            const wPath = node.widgets?.find(w => w.name === "folder_path");
            const wFilter = node.widgets?.find(w => w.name === "filter_type");
            const wStart = node.widgets?.find(w => w.name === "start_index");
            const wEnd = node.widgets?.find(w => w.name === "end_index");
            const wCustom = node.widgets?.find(w => w.name === "custom_filter");

            [wNodeData, wPath, wFilter, wStart, wEnd, wCustom].forEach(w => {
                if (w) {
                    w.hidden = true;
                    if (w.element) w.element.style.display = "none";
                }
            });

            if (wNodeData) {
                try {
                    const savedData = JSON.parse(wNodeData.value || "{}");
                    if (savedData && typeof savedData === 'object') {
                        node.data = { ...node.data, ...savedData };
                    }
                } catch (e) {}
                
                wNodeData.serializeValue = () => {
                    node.syncData();
                    return JSON.stringify(node.data);
                };
            }

            node.uiElements = [];
            node.dropdownMenu = null;
            node.customModal = null;

            node.syncData = function() {
                if (wPath) wPath.value = node.data.folder_path;
                if (wFilter) wFilter.value = node.data.filter_type;
                if (wStart) wStart.value = parseInt(node.data.start_index);
                if (wEnd) wEnd.value = parseInt(node.data.end_index);
                if (wCustom) wCustom.value = node.data.custom_filter;
                
                if (wNodeData) {
                    wNodeData.value = JSON.stringify(node.data);
                }
                
                if (node.graph) {
                    node.graph.changeTracker?.dispatchEvent(new Event("change"));
                }
            };

            const updateNodeSize = () => {
                const targetHeight = node.data.filter_type === "custom" ? MIN_HEIGHT_CUSTOM : MIN_HEIGHT_NORMAL;
                node.min_size = [NODE_WIDTH, targetHeight];
                
                if (Math.abs(node.size[1] - targetHeight) > 1) {
                    node.setSize([node.size[0], targetHeight]);
                    node.setDirtyCanvas(true, true);
                }
            };

            node.onResize = function() {
                const minHeight = this.data.filter_type === "custom" ? MIN_HEIGHT_CUSTOM : MIN_HEIGHT_NORMAL;
                if (this.size[0] < NODE_WIDTH) {
                    this.size[0] = NODE_WIDTH;
                }
                if (this.size[1] < minHeight) {
                    this.size[1] = minHeight;
                }
                this.setDirtyCanvas(true, true);
            };

            const onConfigure = node.onConfigure;
            node.onConfigure = function(o) {
                if (onConfigure) onConfigure.apply(this, arguments);
                if (wNodeData && wNodeData.value) {
                    try {
                        const restoredData = JSON.parse(wNodeData.value);
                        if (restoredData) {
                            node.data = { ...node.data, ...restoredData };
                            node.syncData();
                            updateNodeSize();
                        }
                    } catch (e) {}
                }
            };

            const closeDropdown = (e) => {
                if (node.dropdownMenu && !node.dropdownMenu.contains(e.target)) {
                    node.dropdownMenu.remove();
                    node.dropdownMenu = null;
                }
            };

            const showCustomPrompt = (title, defaultValue, callback) => {
                if (node.customModal) {
                    node.customModal.remove();
                    node.customModal = null;
                }

                const backdrop = document.createElement("div");
                backdrop.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.5); z-index: 10002;
                    display: flex; align-items: center; justify-content: center;
                `;

                const modal = document.createElement("div");
                modal.style.cssText = `
                    background: #1a1a1a; border: 1px solid #444; border-radius: 3px;
                    padding: 16px; min-width: 320px; max-width: 500px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
                    font-family: sans-serif; font-size: 12px; color: #ddd;
                `;

                const titleEl = document.createElement("div");
                titleEl.textContent = title;
                titleEl.style.cssText = `
                    margin-bottom: 12px; font-size: 13px; color: #fff; font-weight: bold;
                `;
                modal.appendChild(titleEl);

                const input = document.createElement("input");
                input.type = "text";
                input.value = defaultValue || "";
                input.style.cssText = `
                    width: 100%; box-sizing: border-box; padding: 8px 10px;
                    background: #222; border: 1px solid #666; border-radius: 3px;
                    color: #fff; font-size: 12px; outline: none;
                    font-family: monospace;
                `;
                input.onfocus = () => { input.style.borderColor = "#2196F3"; };
                input.onblur = () => { input.style.borderColor = "#666"; };
                modal.appendChild(input);

                const btnContainer = document.createElement("div");
                btnContainer.style.cssText = `
                    display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;
                `;

                const btnPaste = document.createElement("div");
                btnPaste.setAttribute("role", "button");
                btnPaste.setAttribute("tabindex", "0");
                btnPaste.textContent = " Paste";
                btnPaste.style.cssText = `
                    padding: 6px 16px; background: #2a2a2a; border: 1px solid #888;
                    border-radius: 3px; color: #ddd; font-size: 12px; cursor: pointer;
                    font-family: sans-serif; min-width: 80px; transition: all 0.2s;
                    user-select: none; -moz-user-select: none;
                    display: inline-flex; align-items: center; justify-content: center;
                `;
                btnPaste.onmousedown = (e) => e.preventDefault();
                btnPaste.onmouseup = (e) => e.preventDefault();
                btnPaste.oncontextmenu = (e) => e.preventDefault();
                btnPaste.onmouseover = () => { if (!btnPaste.disabled) btnPaste.style.background = "#3a3a3a"; };
                btnPaste.onmouseout = () => { if (!btnPaste.disabled) btnPaste.style.background = "#2a2a2a"; };
                
                btnPaste.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    btnPaste.disabled = true;
                    btnPaste.style.opacity = "0.7";
                    btnPaste.style.cursor = "wait";
                    btnPaste.textContent = "⏳ ...";

                    try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                            input.value = text;
                            input.focus();
                            btnPaste.textContent = "✅ Done";
                            btnPaste.style.borderColor = "#4CAF50";
                            btnPaste.style.color = "#4CAF50";
                        }
                    } catch (err) {
                        btnPaste.textContent = "⌨️ Ctrl+V";
                        btnPaste.style.borderColor = "#FF9800";
                        btnPaste.style.color = "#FF9800";
                        input.focus();
                        input.select();
                    }

                    setTimeout(() => {
                        btnPaste.disabled = false;
                        btnPaste.style.opacity = "1";
                        btnPaste.style.cursor = "pointer";
                        btnPaste.textContent = " Paste";
                        btnPaste.style.borderColor = "#888";
                        btnPaste.style.color = "#ddd";
                        btnPaste.style.background = "#2a2a2a";
                    }, 600);
                };

                const btnCancel = document.createElement("button");
                btnCancel.textContent = "Cancel";
                btnCancel.style.cssText = `
                    padding: 6px 16px; background: #2a2a2a; border: 1px solid #888;
                    border-radius: 3px; color: #ddd; font-size: 12px; cursor: pointer;
                    font-family: sans-serif;
                `;
                btnCancel.onmouseover = () => { btnCancel.style.background = "#3a3a3a"; };
                btnCancel.onmouseout = () => { btnCancel.style.background = "#2a2a2a"; };

                const btnOk = document.createElement("button");
                btnOk.textContent = "OK";
                btnOk.style.cssText = `
                    padding: 6px 16px; background: #2196F3; border: 1px solid #2196F3;
                    border-radius: 3px; color: #fff; font-size: 12px; cursor: pointer;
                    font-family: sans-serif; font-weight: bold;
                `;
                btnOk.onmouseover = () => { btnOk.style.background = "#1976D2"; };
                btnOk.onmouseout = () => { btnOk.style.background = "#2196F3"; };

                btnContainer.appendChild(btnPaste);
                btnContainer.appendChild(btnCancel);
                btnContainer.appendChild(btnOk);
                modal.appendChild(btnContainer);
                backdrop.appendChild(modal);
                document.body.appendChild(backdrop);

                node.customModal = backdrop;

                const close = (result) => {
                    backdrop.remove();
                    node.customModal = null;
                    document.removeEventListener("keydown", keyHandler);
                    if (callback) callback(result);
                };

                const confirm = () => close(input.value);
                const cancel = () => close(null);

                btnOk.onclick = (e) => { e.stopPropagation(); confirm(); };
                btnCancel.onclick = (e) => { e.stopPropagation(); cancel(); };
                backdrop.onclick = (e) => {
                    if (e.target === backdrop) cancel();
                };

                const keyHandler = (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        confirm();
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancel();
                    }
                };
                document.addEventListener("keydown", keyHandler);

                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 10);
            };

            const truncatePath = (ctx, path, maxWidth) => {
                if (!path) return "Folder not selected";
                const ellipsis = "...";
                if (ctx.measureText(path).width <= maxWidth) {
                    return path;
                }
                let truncated = path;
                while (truncated.length > 0 && ctx.measureText(ellipsis + truncated).width > maxWidth) {
                    truncated = truncated.substring(1);
                }
                return ellipsis + truncated;
            };

            const drawRoundedRect = (ctx, x, y, w, h, r) => {
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(x, y, w, h, r);
                    ctx.fill();
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(x + r, y);
                    ctx.lineTo(x + w - r, y);
                    ctx.arcTo(x + w, y, x + w, y + r, r);
                    ctx.lineTo(x + w, y + h - r);
                    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
                    ctx.lineTo(x + r, y + h);
                    ctx.arcTo(x, y + h, x, y + h - r, r);
                    ctx.lineTo(x, y + r);
                    ctx.arcTo(x, y, x + r, y, r);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
            };

            node.onDrawForeground = function(ctx) {
                if (this.flags.collapsed) return;
                
                const [w, h] = this.size;
                const padding = 10;
                const rowHeight = 23;
                const borderRadius = 3;
                let currentY = 35 + 60;

                ctx.font = "12px sans-serif";
                ctx.textBaseline = "middle";

                const pathDisplayHeight = 20;
                ctx.fillStyle = "#1a1a1a";
                ctx.strokeStyle = "#333";
                drawRoundedRect(ctx, padding, currentY, w - padding * 2, pathDisplayHeight, borderRadius);
                
                const pathText = node.data.folder_path || "Folder not selected";
                const displayPath = truncatePath(ctx, pathText, w - padding * 2 - 10);
                ctx.fillStyle = node.data.folder_path ? "#aaa" : "#666";
                ctx.textAlign = "left";
                ctx.fillText(displayPath, padding + 5, currentY + pathDisplayHeight / 2);
                currentY += pathDisplayHeight + 7;

                ctx.fillStyle = "#2a2a2a";
                ctx.strokeStyle = "#2196F3";
                drawRoundedRect(ctx, padding, currentY, w - padding * 2, rowHeight, borderRadius);
                ctx.fillStyle = "#2196F3";
                ctx.textAlign = "center";
                ctx.fillText("📁 Select folder", w / 2, currentY + rowHeight / 2);
                this.uiElements.push({ type: "btn_folder", x: padding, y: currentY, w: w - padding * 2, h: rowHeight });
                currentY += rowHeight + 7;

                const filterLabel = `▼ ${node.data.filter_type}`;
                ctx.fillStyle = "#2a2a2a";
                ctx.strokeStyle = "#4CAF50";
                drawRoundedRect(ctx, padding, currentY, w - padding * 2, rowHeight, borderRadius);
                ctx.fillStyle = "#4CAF50";
                ctx.textAlign = "center";
                ctx.fillText(filterLabel, w / 2, currentY + rowHeight / 2);
                this.uiElements.push({ type: "btn_filter", x: padding, y: currentY, w: w - padding * 2, h: rowHeight });
                currentY += rowHeight + 7;

                const drawNumberInput = (label, value, yPos, dataType) => {
                    const labelW = 40;
                    const btnW = 20;
                    const gap = 4;
                    const totalW = w - padding * 2;
                    const valW = totalW - labelW - (btnW * 2) - (gap * 2);
                    
                    ctx.fillStyle = "#aaa";
                    ctx.textAlign = "left";
                    ctx.fillText(label, padding, yPos + rowHeight / 2);
                    
                    const btnX1 = padding + labelW + gap;
                    ctx.fillStyle = "#333";
                    ctx.strokeStyle = "#888";
                    drawRoundedRect(ctx, btnX1, yPos, btnW, rowHeight, borderRadius);
                    ctx.fillStyle = "#fff";
                    ctx.textAlign = "center";
                    ctx.fillText("-", btnX1 + btnW / 2, yPos + rowHeight / 2);
                    
                    const valX = btnX1 + btnW + gap;
                    ctx.fillStyle = "#222";
                    ctx.strokeStyle = "#666";
                    drawRoundedRect(ctx, valX, yPos, valW, rowHeight, borderRadius);
                    ctx.fillStyle = "#fff";
                    ctx.textAlign = "center";
                    ctx.fillText(String(value), valX + valW / 2, yPos + rowHeight / 2);
                    
                    const btnX2 = valX + valW + gap;
                    ctx.fillStyle = "#333";
                    ctx.strokeStyle = "#888";
                    drawRoundedRect(ctx, btnX2, yPos, btnW, rowHeight, borderRadius);
                    ctx.fillStyle = "#fff";
                    ctx.textAlign = "center";
                    ctx.fillText("+", btnX2 + btnW / 2, yPos + rowHeight / 2);

                    this.uiElements.push({ type: `btn_${dataType}_minus`, x: btnX1, y: yPos, w: btnW, h: rowHeight });
                    this.uiElements.push({ type: `val_${dataType}`, x: valX, y: yPos, w: valW, h: rowHeight });
                    this.uiElements.push({ type: `btn_${dataType}_plus`, x: btnX2, y: yPos, w: btnW, h: rowHeight });
                };

                drawNumberInput("Start:", node.data.start_index, currentY, "start");
                currentY += rowHeight + 5;

                drawNumberInput("End:", node.data.end_index, currentY, "end");
                currentY += rowHeight + 12;

                if (node.data.filter_type === "custom") {
                    ctx.fillStyle = "#aaa";
                    ctx.textAlign = "left";
                    ctx.fillText("Custom:", padding, currentY + rowHeight / 2);
                    
                    const custValW = w - padding * 2 - 45;
                    const custX = padding + 45;
                    
                    ctx.fillStyle = "#222";
                    ctx.strokeStyle = "#FF9800";
                    drawRoundedRect(ctx, custX, currentY, custValW, rowHeight, borderRadius);
                    ctx.fillStyle = "#FF9800";
                    ctx.textAlign = "left";
                    ctx.fillText(node.data.custom_filter, custX + 5, currentY + rowHeight / 2);

                    this.uiElements.push({ type: "val_custom", x: custX, y: currentY, w: custValW, h: rowHeight });
                }
            };

            node.onMouseDown = function(event, pos) {
                const [x, y] = pos;
                this.uiElements = [];
                this.onDrawForeground(app.canvas.ctx);

                for (const el of this.uiElements) {
                    if (x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h) {
                        if (el.type === "btn_folder") {
                            showCustomPrompt("Enter folder path", this.data.folder_path, (result) => {
                                if (result !== null) {
                                    this.data.folder_path = result.trim();
                                    node.syncData();
                                }
                            });
                            return true;
                        }
                        
                        if (el.type === "btn_filter") {
                            if (this.dropdownMenu) this.dropdownMenu.remove();
                            
                            const menu = document.createElement("div");
                            menu.style.cssText = `
                                position: fixed; background: #1a1a1a; border: 1px solid #444;
                                border-radius: 3px; max-height: 255px; overflow-y: auto;
                                z-index: 10001; box-shadow: 0 4px 20px rgba(0,0,0,0.5); min-width: 150px;
                            `;
                            
                            filters.forEach(f => {
                                const item = document.createElement("div");
                                item.textContent = f;
                                item.style.cssText = `
                                    padding: 8px 12px; cursor: pointer; color: #ddd; font-size: 12px;
                                    border-bottom: 1px solid #333;
                                    background: ${f === this.data.filter_type ? '#333' : '#1a1a1a'};
                                `;
                                item.onmouseover = () => item.style.background = "#444";
                                item.onmouseout = () => item.style.background = f === this.data.filter_type ? '#333' : "#1a1a1a";
                                item.onclick = (e) => {
                                    e.stopPropagation();
                                    this.data.filter_type = f;
                                    node.syncData();
                                    updateNodeSize();
                                    menu.remove();
                                    this.dropdownMenu = null;
                                };
                                menu.appendChild(item);
                            });
                            
                            const canvasRect = app.canvas.canvas.getBoundingClientRect();
                            const ds = app.canvas.ds;
                            const nodeScreenX = canvasRect.left + ((this.pos[0] + ds.offset[0]) * ds.scale);
                            const nodeScreenY = canvasRect.top + ((this.pos[1] + ds.offset[1]) * ds.scale);
                            
                            menu.style.left = (nodeScreenX + el.x) + "px";
                            menu.style.top = (nodeScreenY + el.y + el.h + 5) + "px";
                            
                            document.body.appendChild(menu);
                            this.dropdownMenu = menu;
                            setTimeout(() => document.addEventListener("mousedown", closeDropdown), 100);
                            return true;
                        }

                        if (el.type === "btn_start_minus") {
                            this.data.start_index = Math.max(1, parseInt(this.data.start_index) - 1);
                            node.syncData();
                            return true;
                        }
                        if (el.type === "btn_start_plus") {
                            this.data.start_index = parseInt(this.data.start_index) + 1;
                            node.syncData();
                            return true;
                        }
                        if (el.type === "val_start") {
                            showCustomPrompt("Start index (min 1)", String(this.data.start_index), (result) => {
                                if (result !== null) {
                                    this.data.start_index = Math.max(1, parseInt(result) || 1);
                                    node.syncData();
                                }
                            });
                            return true;
                        }

                        if (el.type === "btn_end_minus") {
                            this.data.end_index = Math.max(1, parseInt(this.data.end_index) - 1);
                            node.syncData();
                            return true;
                        }
                        if (el.type === "btn_end_plus") {
                            this.data.end_index = parseInt(this.data.end_index) + 1;
                            node.syncData();
                            return true;
                        }
                        if (el.type === "val_end") {
                            showCustomPrompt("End index", String(this.data.end_index), (result) => {
                                if (result !== null) {
                                    this.data.end_index = Math.max(1, parseInt(result) || 1);
                                    node.syncData();
                                }
                            });
                            return true;
                        }

                        if (el.type === "val_custom") {
                            showCustomPrompt("Custom filter (e.g. *_mask.png)", this.data.custom_filter, (result) => {
                                if (result !== null) {
                                    this.data.custom_filter = result.trim() || "*.png";
                                    node.syncData();
                                }
                            });
                            return true;
                        }
                    }
                }
                return false;
            };

            const originalOnRemoved = node.onRemoved;
            node.onRemoved = function() {
                if (this.dropdownMenu) {
                    this.dropdownMenu.remove();
                    this.dropdownMenu = null;
                }
                if (this.customModal) {
                    this.customModal.remove();
                    this.customModal = null;
                }
                document.removeEventListener("mousedown", closeDropdown);
                if (originalOnRemoved) originalOnRemoved.apply(this, arguments);
            };

            node.syncData();
            updateNodeSize();
            
            return result;
        };
    }
});