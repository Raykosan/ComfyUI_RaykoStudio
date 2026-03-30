import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RaykoSaveImage",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RSSaveImage") {
            console.log("🦊 [RS_SaveImage] JS loaded!");
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                this.allow_preview = false;
                this._outputNode = false;
                
                this.data = {
                    text: "",
                    font_name: "default",
                    font_size: 50,
                    footer_height: 100,
                    theme: "light",
                    filename_prefix: "ComfyUI",
                    font_list: ["default"]
                };
                
                this.rowHeight = 28;
                this.padding = 10;
                this.labelWidth = 120;
                this.targetWidth = 350;
                this.clickZones = [];
                this.widgetYPositions = {};
                this.widgetsHeight = 260;
                this.previewHeight = 0;
                
                this.imgs = [];
                this.imageIndex = 0;
                
                this.hiddenWidget = this.widgets.find(w => w.name === "node_data");
                if (this.hiddenWidget) {
                    this.hiddenWidget.hidden = true;
                    this.hiddenWidget.serializeValue = () => {
                        this.syncData();
                        return this.hiddenWidget.value;
                    };
                    try {
                        const saved = JSON.parse(this.hiddenWidget.value);
                        if (saved && typeof saved === 'object') {
                            this.data = { ...this.data, ...saved };
                            if(saved.font_list) this.data.font_list = saved.font_list;
                        }
                    } catch (e) {
                        console.error("🦊 [RS_SaveImage] Error loading saved data", e);
                    }
                }
                
                if (this.widgets) {
                    this.widgets.forEach(w => w.hidden = true);
                }
                
                this.setSize([this.targetWidth, 450]);
                const self = this;

                const onExecuted = this.onExecuted;
                this.onExecuted = function(message) {
                    const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                    
                    if (message?.images) {
                        this.imgs = [];
                        this.imageIndex = 0;
                        this.previewHeight = 0;
                        
                        for (const image of message.images) {
                            const img = new Image();
                            img.onload = () => {
                                this.calculatePreviewSize();
                                this.updateNodeSize();
                                if (this.graph) this.graph.setDirtyCanvas(true, true);
                            };
                            img.src = `/view?filename=${encodeURIComponent(image.filename)}&type=${image.type}&subfolder=${encodeURIComponent(image.subfolder || '')}`;
                            this.imgs.push(img);
                        }
                        
                        if (this.imgs.length > 0) {
                            this.calculatePreviewSize();
                            this.updateNodeSize();
                        }
                    }
                    
                    return r;
                };
                
                this.calculatePreviewSize = function() {
                    if (this.imgs.length > 0 && this.imgs[this.imageIndex]) {
                        const img = this.imgs[this.imageIndex];
                        const aspectRatio = img.height / img.width;
                        const maxWidth = this.size[0] - 40;
                        let drawHeight = maxWidth * aspectRatio;
                        
                        const maxPreviewHeight = 400;
                        if (drawHeight > maxPreviewHeight) {
                            drawHeight = maxPreviewHeight;
                        }
                        
                        this.previewHeight = drawHeight + 10;
                    }
                };
                
                this.updateNodeSize = function() {
                    const totalHeight = this.widgetsHeight + this.previewHeight + 40;
                    if (this.size[1] !== totalHeight) {
                        this.setSize([this.size[0], totalHeight]);
                    }
                };

                this.onDrawBackground = function(ctx) {
                    if (this.imgs.length > 0 && this.imgs[this.imageIndex]) {
                        const img = this.imgs[this.imageIndex];
                        const previewY = this.widgetsHeight + 20;
                        const maxWidth = this.size[0] - 40;
                        
                        const aspectRatio = img.height / img.width;
                        let drawWidth = maxWidth;
                        let drawHeight = maxWidth * aspectRatio;
                        
                        const maxPreviewHeight = 400;
                        if (drawHeight > maxPreviewHeight) {
                            drawHeight = maxPreviewHeight;
                            drawWidth = maxPreviewHeight / aspectRatio;
                        }
                        
                        const previewX = (this.size[0] - drawWidth) / 2;
                        
                        ctx.fillStyle = "#1a1a1a";
                        ctx.fillRect(previewX - 5, previewY - 5, drawWidth + 10, drawHeight + 10);
                        ctx.strokeStyle = "#444";
                        ctx.lineWidth = 1;
                        ctx.strokeRect(previewX - 5, previewY - 5, drawWidth + 10, drawHeight + 10);
                        
                        try {
                            ctx.drawImage(img, previewX, previewY, drawWidth, drawHeight);
                        } catch (e) {
                            console.error("Error drawing preview:", e);
                        }
                        
                        if (this.imgs.length > 1) {
                            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                            ctx.fillRect(previewX + drawWidth - 60, previewY + drawHeight - 25, 55, 20);
                            ctx.fillStyle = "#fff";
                            ctx.font = "11px sans-serif";
                            ctx.textAlign = "center";
                            ctx.fillText(`${this.imageIndex + 1}/${this.imgs.length}`, previewX + drawWidth - 32, previewY + drawHeight - 11);
                        }
                    }
                };

                const onDrawForeground = this.onDrawForeground;
                this.onDrawForeground = function(ctx, visibleRect) {
                    if (onDrawForeground) {
                        onDrawForeground.apply(this, arguments);
                    }
                    
                    this.clickZones = [];
                    const startY = 80;
                    const rowH = this.rowHeight;
                    const pad = this.padding;
                    const labelW = this.labelWidth;
                    const arrowW = 25;
                    const inputW = this.size[0] - pad*2 - labelW;
                    let y = startY;

                    this.drawLabel(ctx, "TEXT", pad, y, labelW, rowH * 2);
                    this.drawMultilineField(ctx, this.data.text, pad + labelW, y, inputW, rowH * 2);
                    this.clickZones.push({ type: "text", x: pad + labelW, y: y, w: inputW, h: rowH * 2 });
                    this.widgetYPositions["text"] = y;
                    y += rowH * 2 + 10;

                    this.drawLabel(ctx, "FONT", pad, y, labelW, rowH);
                    this.drawComboField(ctx, this.data.font_name, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["font_name"] = y;
                    this.clickZones.push({ type: "combo", field: "font_name", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawLabel(ctx, "FONT SIZE", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.font_size, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["font_size"] = y;
                    this.clickZones.push({ type: "number", field: "font_size", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 1, max: 512 });
                    this.clickZones.push({ type: "arrow_left", field: "font_size", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 1, max: 512, step: 1 });
                    this.clickZones.push({ type: "arrow_right", field: "font_size", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 1, max: 512, step: 1 });
                    y += rowH + 5;

                    this.drawLabel(ctx, "FOOTER SIZE", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.footer_height, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["footer_height"] = y;
                    this.clickZones.push({ type: "number", field: "footer_height", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 0, max: 1024 });
                    this.clickZones.push({ type: "arrow_left", field: "footer_height", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 0, max: 1024, step: 1 });
                    this.clickZones.push({ type: "arrow_right", field: "footer_height", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 0, max: 1024, step: 1 });
                    y += rowH + 5;

                    this.drawLabel(ctx, "THEME", pad, y, labelW, rowH);
                    this.drawComboField(ctx, this.data.theme, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["theme"] = y;
                    this.clickZones.push({ type: "combo", field: "theme", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawLabel(ctx, "PREFIX", pad, y, labelW, rowH);
                    this.drawStringField(ctx, this.data.filename_prefix, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["filename_prefix"] = y;
                    this.clickZones.push({ type: "string", field: "filename_prefix", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 10;

                    this.widgetsHeight = y;
                };

                this.onMouseDown = function(e, pos, canvas) {
                    if (!this.clickZones.length) return false;
                    
                    if (this.imgs.length > 1 && this.imgs[this.imageIndex]) {
                        const img = this.imgs[this.imageIndex];
                        const previewY = this.widgetsHeight + 20;
                        const maxWidth = this.size[0] - 40;
                        const aspectRatio = img.height / img.width;
                        let drawWidth = maxWidth;
                        let drawHeight = maxWidth * aspectRatio;
                        const maxPreviewHeight = 400;
                        if (drawHeight > maxPreviewHeight) {
                            drawHeight = maxPreviewHeight;
                            drawWidth = maxPreviewHeight / aspectRatio;
                        }
                        
                        const previewX = (this.size[0] - drawWidth) / 2;
                        
                        if (pos[0] >= previewX + drawWidth - 60 && pos[0] <= previewX + drawWidth &&
                            pos[1] >= previewY + drawHeight - 25 && pos[1] <= previewY + drawHeight - 5) {
                            this.imageIndex = (this.imageIndex + 1) % this.imgs.length;
                            this.calculatePreviewSize();
                            this.updateNodeSize();
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        }
                    }
                    
                    for (const zone of this.clickZones) {
                        const inX = pos[0] >= zone.x && pos[0] <= zone.x + zone.w;
                        const inY = pos[1] >= zone.y && pos[1] <= zone.y + zone.h;
                        if (inX && inY) {
                            if (zone.type === "text") {
                                self.showTextInput(e);
                                return true;
                            }
                            if (zone.type === "string") {
                                self.showInlineInput(zone.field, e);
                                return true;
                            }
                            if (zone.type === "combo") {
                                self.showComboSelector(zone.field, e);
                                return true;
                            }
                            if (zone.type === "number") {
                                if (zone.field === "font_size") {
                                    self.showInlineInput(zone.field, e, { isNumber: true, min: 1, max: 512, step: 1 });
                                } else if (zone.field === "footer_height") {
                                    self.showInlineInput(zone.field, e, { isNumber: true, min: 0, max: 1024, step: 1 });
                                } else {
                                    const current = self.data[zone.field];
                                    const newVal = prompt(`${zone.field}:`, current);
                                    if (newVal !== null) {
                                        let parsed = parseInt(newVal);
                                        if (!isNaN(parsed)) {
                                            parsed = Math.max(zone.min, Math.min(zone.max, parsed));
                                            self.data[zone.field] = parsed;
                                            self.updateUI();
                                        }
                                    }
                                }
                                return true;
                            }
                            if (zone.type === "arrow_left") {
                                let current = self.data[zone.field];
                                current = current - zone.step;
                                self.data[zone.field] = Math.max(zone.min, current);
                                self.updateUI();
                                return true;
                            }
                            if (zone.type === "arrow_right") {
                                let current = self.data[zone.field];
                                current = current + zone.step;
                                self.data[zone.field] = Math.min(zone.max, current);
                                self.updateUI();
                                return true;
                            }
                        }
                    }
                    return false;
                };

                this.drawLabel = function(ctx, text, x, y, w, h) {
                    ctx.fillStyle = "#aaa";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(text, x, y + h/2 + 4);
                };

                this.drawMultilineField = function(ctx, value, x, y, w, h) {
                    ctx.fillStyle = "#222";
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = "#444";
                    ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = "#fff";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "left";
                    
                    if (!value || value.trim() === "") {
                        ctx.fillStyle = "#666";
                        ctx.fillText("Enter text...", x + 5, y + h/2 + 4);
                        return;
                    }
                    
                    const lines = value.split('\n');
                    const lineHeight = 14;
                    const startY = y + 10;
                    const maxLines = 3;
                    
                    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
                        let line = lines[i];
                        if (line.length > 35) {
                            line = line.substring(0, 32) + "...";
                        }
                        ctx.fillText(line, x + 5, startY + (i * lineHeight));
                    }
                    
                    if (lines.length > maxLines) {
                        ctx.fillStyle = "#666";
                        ctx.fillText("...", x + 5, startY + (maxLines * lineHeight));
                    }
                };
                
                this.drawStringField = function(ctx, value, x, y, w, h) {
                    ctx.fillStyle = "#222";
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = "#444";
                    ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = "#fff";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(value || "", x + 5, y + h/2 + 4);
                };

                this.drawComboField = function(ctx, value, x, y, w, h) {
                    ctx.fillStyle = "#222";
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = "#444";
                    ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = "#fff";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(value, x + w/2, y + h/2 + 4);
                    ctx.fillStyle = "#666";
                    ctx.beginPath();
                    ctx.moveTo(x + w - 12, y + h/2 - 3);
                    ctx.lineTo(x + w - 6, y + h/2 - 3);
                    ctx.lineTo(x + w - 9, y + h/2 + 3);
                    ctx.fill();
                };

                this.drawNumberFieldWithArrows = function(ctx, value, x, y, w, h, arrowW) {
                    ctx.fillStyle = "#222";
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = "#444";
                    ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = "#4CAF50";
                    ctx.beginPath();
                    ctx.moveTo(x + 8, y + h/2);
                    ctx.lineTo(x + 16, y + h/2 - 6);
                    ctx.lineTo(x + 16, y + h/2 + 6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = "#4CAF50";
                    ctx.beginPath();
                    ctx.moveTo(x + w - 8, y + h/2);
                    ctx.lineTo(x + w - 16, y + h/2 - 6);
                    ctx.lineTo(x + w - 16, y + h/2 + 6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = "#fff";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(value, x + w/2, y + h/2 + 4);
                };

                this.showComboSelector = function(fieldName, clickEvent) {
                    let list = [];
                    if (fieldName === "font_name") {
                        list = self.data.font_list || ["default"];
                    } else if (fieldName === "theme") {
                        list = ["light", "dark"];
                    }
                    
                    if (!list.length) return;
                    
                    const menu = document.createElement("div");
                    menu.style.cssText = `
                        position: fixed;
                        background: #1a1a1a;
                        border: 1px solid #444;
                        border-radius: 6px;
                        max-height: 300px;
                        overflow-y: auto;
                        z-index: 10001;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                        min-width: 150px;
                    `;
                    
                    list.forEach(opt => {
                        const item = document.createElement("div");
                        item.textContent = opt;
                        item.style.cssText = `
                            padding: 10px 15px;
                            cursor: pointer;
                            color: #ddd;
                            font-size: 12px;
                            border-bottom: 1px solid #333;
                        `;
                        item.onmouseover = () => item.style.background = "#333";
                        item.onmouseout = () => item.style.background = "#1a1a1a";
                        item.onclick = (ev) => {
                            ev.stopPropagation();
                            ev.preventDefault();
                            self.data[fieldName] = opt;
                            self.updateUI();
                            menu.remove();
                        };
                        menu.appendChild(item);
                    });
                    
                    if (clickEvent) {
                        menu.style.left = (clickEvent.clientX + 8) + "px";
                        menu.style.top = clickEvent.clientY + "px";
                    } else {
                        menu.style.left = "250px";
                        menu.style.top = "200px";
                    }
                    
                    document.body.appendChild(menu);
                    
                    setTimeout(() => {
                        const closeHandler = (ev) => {
                            if (!menu.contains(ev.target)) {
                                menu.remove();
                                document.removeEventListener("mousedown", closeHandler);
                            }
                        };
                        document.addEventListener("mousedown", closeHandler);
                    }, 100);
                };

                this.showTextInput = function(clickEvent) {
                    const currentValue = self.data.text || '';
                    
                    const popup = document.createElement('div');
                    popup.style.cssText = `
                        position: fixed;
                        z-index: 10002;
                        background: #1a1a1a;
                        border: 1px solid #444;
                        border-radius: 6px;
                        padding: 10px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                    `;
                    
                    const input = document.createElement('textarea');
                    input.value = currentValue;
                    input.style.cssText = `
                        width: 300px;
                        height: 150px;
                        background: #222;
                        color: #fff;
                        border: 1px solid #444;
                        border-radius: 4px;
                        padding: 10px;
                        font-size: 12px;
                        resize: none;
                        display: block;
                        margin-bottom: 10px;
                    `;
                    
                    const saveBtn = document.createElement('button');
                    saveBtn.textContent = '✅ SAVE';
                    saveBtn.style.cssText = `
                        background: #4CAF50;
                        color: #fff;
                        border: none;
                        border-radius: 4px;
                        padding: 8px 16px;
                        font-size: 14px;
                        cursor: pointer;
                        float: right;
                    `;
                    saveBtn.onmouseover = () => saveBtn.style.background = "#45a049";
                    saveBtn.onmouseout = () => saveBtn.style.background = "#4CAF50";
                    
                    popup.appendChild(input);
                    popup.appendChild(saveBtn);
                    
                    if (clickEvent) {
                        popup.style.left = (clickEvent.clientX + 8) + 'px';
                        popup.style.top = clickEvent.clientY + 'px';
                    }
                    
                    document.body.appendChild(popup);
                    
                    setTimeout(() => {
                        input.focus();
                        setTimeout(() => {
                            if (currentValue && currentValue.length > 0) {
                                input.select();
                            }
                        }, 10);
                    }, 50);

                    saveBtn.onclick = (ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        self.data.text = input.value;
                        self.updateUI();
                        popup.remove();
                    };
                    
                    input.onkeydown = (ev) => {
                        if (ev.key === 'Enter' && ev.ctrlKey) {
                            ev.preventDefault();
                            self.data.text = input.value;
                            self.updateUI();
                            popup.remove();
                        }
                    };
                };
                
                this.showInlineInput = function(fieldName, clickEvent, options = {}) {
                    const currentValue = self.data[fieldName] || '';
                    const isNumber = options.isNumber || false;
                    const min = options.min !== undefined ? options.min : null;
                    const max = options.max !== undefined ? options.max : null;
                    
                    const popup = document.createElement('div');
                    popup.style.cssText = `
                        position: fixed;
                        z-index: 10003;
                        background: #1a1a1a;
                        border: 1px solid #444;
                        border-radius: 6px;
                        padding: 8px 12px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        white-space: nowrap;
                    `;
                    
                    const input = document.createElement('input');
                    input.type = isNumber ? 'number' : 'text';
                    input.value = currentValue;
                    if (isNumber) {
                        input.step = options.step || 1;
                        if (min !== null) input.min = min;
                        if (max !== null) input.max = max;
                    }
                    input.style.cssText = `
                        width: 100px;
                        background: #222;
                        color: #fff;
                        border: 1px solid #444;
                        border-radius: 4px;
                        padding: 6px 10px;
                        font-size: 12px;
                        outline: none;
                    `;
                    
                    const saveBtn = document.createElement('button');
                    saveBtn.textContent = '✅';
                    saveBtn.title = 'Save';
                    saveBtn.style.cssText = `
                        background: #4CAF50;
                        color: #fff;
                        border: none;
                        border-radius: 4px;
                        padding: 6px 12px;
                        font-size: 12px;
                        cursor: pointer;
                        min-width: 28px;
                    `;
                    saveBtn.onmouseover = () => saveBtn.style.background = "#45a049";
                    saveBtn.onmouseout = () => saveBtn.style.background = "#4CAF50";
                    
                    popup.appendChild(input);
                    popup.appendChild(saveBtn);
                    
                    if (clickEvent) {
                        popup.style.left = (clickEvent.clientX + 8) + 'px';
                        popup.style.top = clickEvent.clientY + 'px';
                    }
                    
                    document.body.appendChild(popup);
                    
                    setTimeout(() => {
                        input.focus();
                        setTimeout(() => {
                            if (currentValue && currentValue.toString().length > 0) {
                                input.select();
                            }
                        }, 10);
                    }, 50);
                    
                    const doSave = () => {
                        let value = input.value;
                        if (isNumber) {
                            let num = parseInt(value);
                            if (isNaN(num)) num = self.data[fieldName];
                            if (min !== null) num = Math.max(min, num);
                            if (max !== null) num = Math.min(max, num);
                            value = num;
                        }
                        self.data[fieldName] = value;
                        self.updateUI();
                        popup.remove();
                    };
                    
                    saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); doSave(); };
                    input.onkeydown = (ev) => { 
                        if (ev.key === 'Enter') { 
                            ev.preventDefault(); 
                            doSave(); 
                        } 
                    };
                    
                    setTimeout(() => {
                        const closeHandler = (ev) => {
                            if (!popup.contains(ev.target)) {
                                popup.remove();
                                document.removeEventListener("mousedown", closeHandler);
                            }
                        };
                        document.addEventListener("mousedown", closeHandler);
                    }, 50);
                    
                    return popup;
                };

                this.showStringInput = function(fieldName) {
                    const currentValue = self.data[fieldName] || '';
                    const newVal = prompt(`Enter ${fieldName}:`, currentValue);
                    if (newVal !== null) {
                        self.data[fieldName] = newVal;
                        self.updateUI();
                    }
                };

                this.syncData = function() {
                    if (this.hiddenWidget) {
                        this.hiddenWidget.value = JSON.stringify(self.data, null, 2)
                            .replace(/\\u([0-9a-fA-F]{4})/g, function(match, p1) {
                                return String.fromCharCode(parseInt(p1, 16));
                            });
                    }
                };

                this.updateUI = function() {
                    self.syncData();
                    if (self.graph) self.graph.setDirtyCanvas(true, true);
                };

                const onSerialize = this.onSerialize;
                this.onSerialize = function(o) {
                    self.syncData();
                    return onSerialize ? onSerialize.apply(this, arguments) : undefined;
                };

                const onExecute = this.onExecute;
                this.onExecute = function() {
                    self.syncData();
                    return onExecute ? onExecute.apply(this, arguments) : undefined;
                };

                return result;
            };
        }
    }
});

console.log("🦊 [RS_SaveImage] Extension initialized");