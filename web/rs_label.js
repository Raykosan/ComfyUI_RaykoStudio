import { app } from "../../scripts/app.js";

const rgthree = {
    processingMouseDown: false,
    lastCanvasMouseEvent: null
};

app.registerExtension({
    name: "RaykoStudio.RSLabel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RSLabel") return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function() {
            if (origOnCreated) origOnCreated.apply(this, arguments);
            
            this.title = "";
            this.resizable = false;
            this.collapsable = false;
            this.flags = {};
            
            this.shape = LiteGraph.CUSTOM_SHAPE;
            this.color = "#fff0";
            this.bgcolor = "#fff0";
            this.shadow_color = "transparent";
            
            this.onDrawBackground = function(ctx) {};
            
            this.properties = {
                text: "Sample Text",
                fontSize: 24,
                fontFamily: "",
                fontColor: "#FF0000",
                textAlign: "left",
                backgroundColor: "transparent",
                bgTransparent: true,
                padding: 10,
                borderRadius: 5,
                borderWidth: 2,
                borderColor: "#FF0000",
                lineSpacing: 1.0,
                letterSpacing: 0,
                strokeWidth: 0,
                strokeColor: "#000000"
            };
            
            this._fontsLoaded = false;
            this._fontLoadError = null;
            this._fontLoadPromise = this.loadFonts();
            this.dialogOpen = false;
        };
        
        nodeType.prototype.loadFonts = async function() {
            try {
                const response = await fetch('/rayko/rs_label/get_fonts');
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                this.availableFonts = data.font_list.map(f => f.replace(/\.(ttf|otf)$/i, ''));
                
                if (this.availableFonts.length > 0 && !this.properties.fontFamily) {
                    this.properties.fontFamily = this.availableFonts[0];
                }
                
                for (const fontFile of data.font_list) {
                    const fontName = fontFile.replace(/\.(ttf|otf)$/i, '');
                    const encodedFilename = encodeURIComponent(fontFile);
                    const fontPath = `/rayko/rs_label/font/${encodedFilename}`;
                    
                    const fontFace = new FontFace(fontName, `url(${fontPath})`);
                    await fontFace.load();
                    document.fonts.add(fontFace);
                }
                
                this._fontsLoaded = true;
                this.setDirtyCanvas(true, true);
            } catch (e) {
                this.availableFonts = [];
                this._fontsLoaded = false;
                this._fontLoadError = e.message;
            }
        };
        
        nodeType.prototype.drawLabel = function(ctx) {
            ctx.save();
            
            const fontSize = Math.max(this.properties.fontSize || 12, 1);
            const fontFamily = this.properties.fontFamily || "Arial";
            const fontColor = this.properties.fontColor || "#FF0000";
            const textAlign = this.properties.textAlign || "left";
            const borderRadius = Number(this.properties.borderRadius) || 0;
            const borderWidth = Number(this.properties.borderWidth) || 0;
            const borderColor = this.properties.borderColor || "#FF0000";
            const lineSpacing = Math.max(0.5, Math.min(3.0, Number(this.properties.lineSpacing) || 1.0));
            const letterSpacing = Number(this.properties.letterSpacing) || 0;
            const strokeWidth = Math.max(0, Math.min(10, Number(this.properties.strokeWidth) || 0));
            const strokeColor = this.properties.strokeColor || "#000000";
            
            const effectivePadding = Math.max(Number(this.properties.padding) || 0, 5);
            const halfStroke = strokeWidth / 2;
            
            const text = this.properties.text || "";
            const lines = text.split("\n");
            
            const isFontReady = document.fonts.check(`${fontSize}px "${fontFamily}"`);
            const displayFont = isFontReady ? fontFamily : "Arial";
            
            ctx.font = `${fontSize}px "${displayFont}"`;
            ctx.textBaseline = "alphabetic";
            
            let maxWidth = 0;
            const lineMetrics = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                let lineWidth = 0;
                
                if (letterSpacing !== 0 && line.length > 1) {
                    for (let c = 0; c < line.length; c++) {
                        lineWidth += ctx.measureText(line[c]).width;
                        if (c < line.length - 1) lineWidth += letterSpacing;
                    }
                } else {
                    lineWidth = ctx.measureText(line || " ").width;
                }
                
                if (lineWidth > maxWidth) maxWidth = lineWidth;
                
                const m = ctx.measureText(line || " ");
                const ascent = m.actualBoundingBoxAscent;
                const descent = m.actualBoundingBoxDescent;
                const lineHeight = (ascent + descent) * lineSpacing;
                
                lineMetrics.push({ width: lineWidth, ascent, descent, lineHeight });
            }
            
            let totalTextHeight = 0;
            if (lines.length > 0) {
                totalTextHeight = lineMetrics[0].ascent + halfStroke;
                for (let i = 0; i < lines.length - 1; i++) {
                    totalTextHeight += lineMetrics[i].lineHeight;
                }
                totalTextHeight += lineMetrics[lines.length - 1].descent + halfStroke;
            } else {
                totalTextHeight = fontSize + strokeWidth;
            }
            
            const contentWidth = maxWidth + strokeWidth + effectivePadding * 2;
            const contentHeight = totalTextHeight + effectivePadding * 2;
            
            this.size[0] = Math.max(contentWidth, 100);
            this.size[1] = Math.max(contentHeight, 40);
            
            if (borderWidth > 0) {
                ctx.beginPath();
                ctx.roundRect(0, 0, this.size[0], this.size[1], [borderRadius]);
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = borderWidth;
                ctx.stroke();
            }
            
            if (!this.properties.bgTransparent && this.properties.backgroundColor) {
                ctx.beginPath();
                ctx.roundRect(0, 0, this.size[0], this.size[1], [borderRadius]);
                ctx.fillStyle = this.properties.backgroundColor;
                ctx.fill();
            }
            
            ctx.fillStyle = fontColor;
            const innerWidth = this.size[0] - effectivePadding * 2;
            
            let baseTextX = effectivePadding + halfStroke;
            if (textAlign === "center") {
                baseTextX = effectivePadding + halfStroke + (innerWidth - strokeWidth - maxWidth) / 2;
            } else if (textAlign === "right") {
                baseTextX = this.size[0] - effectivePadding - halfStroke - maxWidth;
            }
            
            let currentY = effectivePadding + halfStroke;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const metrics = lineMetrics[i];
                
                let lineOffsetX = 0;
                if (textAlign === "center") {
                    lineOffsetX = (maxWidth - metrics.width) / 2;
                } else if (textAlign === "right") {
                    lineOffsetX = maxWidth - metrics.width;
                }
                
                const startX = baseTextX + lineOffsetX;
                const drawY = currentY + metrics.ascent;
                
                if (strokeWidth > 0) {
                    ctx.lineWidth = strokeWidth;
                    ctx.strokeStyle = strokeColor;
                    ctx.lineJoin = "round";
                    ctx.miterLimit = 2;
                }
                
                if (letterSpacing !== 0 && line.length > 0) {
                    let penX = startX;
                    for (let c = 0; c < line.length; c++) {
                        const char = line[c];
                        if (strokeWidth > 0) ctx.strokeText(char, penX, drawY);
                        ctx.fillText(char, penX, drawY);
                        penX += ctx.measureText(char).width + letterSpacing;
                    }
                } else {
                    if (strokeWidth > 0) ctx.strokeText(line, startX, drawY);
                    ctx.fillText(line, startX, drawY);
                }
                
                currentY += metrics.lineHeight;
            }
            
            ctx.restore();
        };
        
        nodeType.prototype.onDblClick = function(event, pos, canvas) {
            this.showSettingsDialog();
        };
        
        nodeType.prototype.showSettingsDialog = async function() {
            if (this.dialogOpen) return;
            
            if (this._fontLoadPromise) {
                try { await this._fontLoadPromise; } catch (e) {}
            }
            
            this.dialogOpen = true;
            this.setDirtyCanvas(true, true);

            const dialog = document.createElement("div");
            dialog.style.position = "fixed";
            dialog.style.background = "#1a1a1a";
            dialog.style.border = "2px solid #333";
            dialog.style.borderRadius = "8px";
            dialog.style.padding = "20px";
            dialog.style.zIndex = "10000";
            dialog.style.minWidth = "350px";
            dialog.style.color = "#fff";
            dialog.style.fontFamily = "Arial, sans-serif";
            
            const title = document.createElement("h3");
            title.textContent = "🦊 RS Label Settings";
            title.style.margin = "0 0 15px 0";
            title.style.color = "#fff";
            title.style.cursor = "grab";
            title.style.userSelect = "none";
            title.style.paddingBottom = "5px";
            title.style.borderBottom = "1px solid #333";
            dialog.appendChild(title);
            
            let isDragging = false;
            let dragOffsetX = 0;
            let dragOffsetY = 0;
            
            title.addEventListener("mousedown", (e) => {
                isDragging = true;
                const rect = dialog.getBoundingClientRect();
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
                title.style.cursor = "grabbing";
                e.preventDefault();
            });
            
            document.addEventListener("mousemove", (e) => {
                if (!isDragging) return;
                let newX = e.clientX - dragOffsetX;
                let newY = e.clientY - dragOffsetY;
                const w = dialog.offsetWidth;
                const h = dialog.offsetHeight;
                newX = Math.max(10, Math.min(window.innerWidth - w - 10, newX));
                newY = Math.max(10, Math.min(window.innerHeight - 20, newY));
                dialog.style.left = newX + "px";
                dialog.style.top = newY + "px";
            });
            
            document.addEventListener("mouseup", () => {
                if (isDragging) { isDragging = false; title.style.cursor = "grab"; }
            });

            // FIX: Перехват History API для отслеживания навигации ComfyUI
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            
            const onNavigate = () => {
                closeDialog();
            };
            
            history.pushState = function(...args) {
                originalPushState.apply(this, args);
                onNavigate();
            };
            
            history.replaceState = function(...args) {
                originalReplaceState.apply(this, args);
                onNavigate();
            };

            const closeDialog = () => {
                // Восстанавливаем оригинальные методы History API
                history.pushState = originalPushState;
                history.replaceState = originalReplaceState;
                
                document.removeEventListener("keydown", escHandler);
                document.removeEventListener("visibilitychange", visibilityHandler);
                window.removeEventListener("hashchange", onHashChange);
                if (dialog.parentNode) document.body.removeChild(dialog);
                this.dialogOpen = false;
                this.setDirtyCanvas(true, true);
            };
            
            const escHandler = (e) => { if (e.key === "Escape") closeDialog(); };
            document.addEventListener("keydown", escHandler);
            
            const visibilityHandler = () => {
                if (document.hidden) closeDialog();
            };
            document.addEventListener("visibilitychange", visibilityHandler);
            
            // Оставляем hashchange как запасной вариант
            const currentHash = window.location.hash;
            const onHashChange = () => {
                if (window.location.hash !== currentHash) closeDialog();
            };
            window.addEventListener("hashchange", onHashChange);
            
            const createRow = (label, createControl) => {
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.alignItems = "center";
                row.style.marginBottom = "10px";
                row.style.gap = "10px";
                const labelEl = document.createElement("label");
                labelEl.textContent = label;
                labelEl.style.minWidth = "120px";
                labelEl.style.color = "#ccc";
                const control = createControl();
                row.appendChild(labelEl);
                row.appendChild(control);
                dialog.appendChild(row);
            };
            
            const textRow = document.createElement("div");
            textRow.style.marginBottom = "15px";
            const textLabel = document.createElement("label");
            textLabel.textContent = "Text:";
            textLabel.style.display = "block";
            textLabel.style.marginBottom = "5px";
            textLabel.style.color = "#ccc";
            const textarea = document.createElement("textarea");
            textarea.value = this.properties.text || "";
            textarea.rows = 4;
            textarea.style.width = "100%";
            textarea.style.padding = "8px";
            textarea.style.background = "#2a2a2a";
            textarea.style.color = "#fff";
            textarea.style.border = "1px solid #444";
            textarea.style.borderRadius = "4px";
            textarea.style.resize = "vertical";
            textarea.style.fontFamily = "monospace";
            textarea.addEventListener("input", (e) => {
                this.properties.text = e.target.value;
                this.setDirtyCanvas(true, true);
            });
            textRow.appendChild(textLabel);
            textRow.appendChild(textarea);
            dialog.appendChild(textRow);
            
            createRow("Font Size:", () => {
                const input = document.createElement("input");
                input.type = "number";
                input.value = this.properties.fontSize;
                input.min = 1; input.max = 200;
                input.style.cssText = "width:80px;padding:6px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;";
                input.addEventListener("change", (e) => {
                    this.properties.fontSize = parseInt(e.target.value);
                    this.setDirtyCanvas(true, true);
                });
                return input;
            });
            
            createRow("Font Family:", () => {
                const select = document.createElement("select");
                select.style.cssText = "width:200px;padding:6px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;";
                const fonts = this.availableFonts;
                if (!fonts || fonts.length === 0) {
                    const opt = document.createElement("option");
                    opt.textContent = this._fontLoadError ? `Error: ${this._fontLoadError}` : "Loading...";
                    opt.disabled = true;
                    select.appendChild(opt);
                } else {
                    fonts.forEach(font => {
                        const option = document.createElement("option");
                        option.value = font; option.textContent = font;
                        if (font === this.properties.fontFamily) option.selected = true;
                        select.appendChild(option);
                    });
                }
                select.addEventListener("change", (e) => {
                    this.properties.fontFamily = e.target.value;
                    this.setDirtyCanvas(true, true);
                });
                return select;
            });
            
            createRow("Font Color:", () => {
                const container = document.createElement("div");
                container.style.display = "flex"; container.style.alignItems = "center"; container.style.gap = "8px";
                const preview = document.createElement("div");
                preview.style.cssText = "width:24px;height:24px;border:1px solid #555;border-radius:4px;cursor:pointer;";
                preview.style.backgroundColor = this.properties.fontColor || "#FF0000";
                const colorInput = document.createElement("input");
                colorInput.type = "color"; colorInput.value = this.properties.fontColor || "#FF0000"; colorInput.style.display = "none";
                preview.addEventListener("click", () => colorInput.click());
                colorInput.addEventListener("input", (e) => {
                    this.properties.fontColor = e.target.value;
                    preview.style.backgroundColor = e.target.value;
                    this.setDirtyCanvas(true, true);
                });
                container.appendChild(preview); container.appendChild(colorInput);
                return container;
            });
            
            createRow("Text Align:", () => {
                const select = document.createElement("select");
                select.style.cssText = "width:120px;padding:6px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;";
                ["left", "center", "right"].forEach(align => {
                    const option = document.createElement("option");
                    option.value = align; option.textContent = align;
                    if (align === this.properties.textAlign) option.selected = true;
                    select.appendChild(option);
                });
                select.addEventListener("change", (e) => {
                    this.properties.textAlign = e.target.value;
                    this.setDirtyCanvas(true, true);
                });
                return select;
            });
            
            createRow("Line Spacing:", () => {
                const input = document.createElement("input");
                input.type = "number";
                input.value = this.properties.lineSpacing;
                input.min = 0.5; input.max = 3.0; input.step = 0.1;
                input.style.cssText = "width:80px;padding:6px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;";
                input.addEventListener("change", (e) => {
                    this.properties.lineSpacing = parseFloat(e.target.value);
                    this.setDirtyCanvas(true, true);
                });
                return input;
            });
            
            createRow("Letter Spacing:", () => {
                const input = document.createElement("input");
                input.type = "number";
                input.value = this.properties.letterSpacing;
                input.min = -10; input.max = 50; input.step = 1;
                input.style.cssText = "width:80px;padding:6px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;";
                input.addEventListener("change", (e) => {
                    this.properties.letterSpacing = parseInt(e.target.value);
                    this.setDirtyCanvas(true, true);
                });
                return input;
            });
            
            createRow("Stroke Width:", () => {
                const input = document.createElement("input");
                input.type = "number";
                input.value = this.properties.strokeWidth;
                input.min = 0; input.max = 10; input.step = 1;
                input.style.cssText = "width:80px;padding:6px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;";
                input.addEventListener("change", (e) => {
                    this.properties.strokeWidth = parseInt(e.target.value);
                    this.setDirtyCanvas(true, true);
                });
                return input;
            });
            
            createRow("Stroke Color:", () => {
                const container = document.createElement("div");
                container.style.display = "flex"; container.style.alignItems = "center"; container.style.gap = "8px";
                const preview = document.createElement("div");
                preview.style.cssText = "width:24px;height:24px;border:1px solid #555;border-radius:4px;cursor:pointer;";
                preview.style.backgroundColor = this.properties.strokeColor || "#000000";
                const colorInput = document.createElement("input");
                colorInput.type = "color"; colorInput.value = this.properties.strokeColor || "#000000"; colorInput.style.display = "none";
                preview.addEventListener("click", () => colorInput.click());
                colorInput.addEventListener("input", (e) => {
                    this.properties.strokeColor = e.target.value;
                    preview.style.backgroundColor = e.target.value;
                    this.setDirtyCanvas(true, true);
                });
                container.appendChild(preview); container.appendChild(colorInput);
                return container;
            });
            
            createRow("BG Transparent:", () => {
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = this.properties.bgTransparent;
                checkbox.addEventListener("change", (e) => {
                    this.properties.bgTransparent = e.target.checked;
                    this.setDirtyCanvas(true, true);
                });
                return checkbox;
            });
            
            createRow("BG Color:", () => {
                const container = document.createElement("div");
                container.style.display = "flex"; container.style.alignItems = "center"; container.style.gap = "8px";
                const preview = document.createElement("div");
                preview.style.cssText = "width:24px;height:24px;border:1px solid #555;border-radius:4px;cursor:pointer;";
                preview.style.backgroundColor = this.properties.backgroundColor || "#ffffff";
                const colorInput = document.createElement("input");
                colorInput.type = "color"; colorInput.value = this.properties.backgroundColor || "#ffffff"; colorInput.style.display = "none";
                preview.addEventListener("click", () => {
                    if (this.properties.bgTransparent) return;
                    colorInput.click();
                });
                colorInput.addEventListener("input", (e) => {
                    this.properties.backgroundColor = e.target.value;
                    preview.style.backgroundColor = e.target.value;
                    this.setDirtyCanvas(true, true);
                });
                container.appendChild(preview); container.appendChild(colorInput);
                return container;
            });
            
            createRow("Padding:", () => {
                const input = document.createElement("input");
                input.type = "number";
                input.value = Math.max(0, this.properties.padding - 5);
                input.min = 0; input.max = 95; input.step = 1;
                input.style.cssText = "width:80px;padding:6px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;";
                input.addEventListener("change", (e) => {
                    this.properties.padding = Math.max(5, parseInt(e.target.value) + 5);
                    this.setDirtyCanvas(true, true);
                });
                return input;
            });
            
            createRow("Border Radius:", () => {
                const input = document.createElement("input");
                input.type = "number";
                input.value = this.properties.borderRadius;
                input.min = 0; input.max = 50; input.step = 1;
                input.style.cssText = "width:80px;padding:6px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;";
                input.addEventListener("change", (e) => {
                    this.properties.borderRadius = parseInt(e.target.value);
                    this.setDirtyCanvas(true, true);
                });
                return input;
            });
            
            createRow("Border Width:", () => {
                const input = document.createElement("input");
                input.type = "number";
                input.value = this.properties.borderWidth;
                input.min = 0; input.max = 20; input.step = 1;
                input.style.cssText = "width:80px;padding:6px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;";
                input.addEventListener("change", (e) => {
                    this.properties.borderWidth = parseInt(e.target.value);
                    this.setDirtyCanvas(true, true);
                });
                return input;
            });
            
            createRow("Border Color:", () => {
                const container = document.createElement("div");
                container.style.display = "flex"; container.style.alignItems = "center"; container.style.gap = "8px";
                const preview = document.createElement("div");
                preview.style.cssText = "width:24px;height:24px;border:1px solid #555;border-radius:4px;cursor:pointer;";
                preview.style.backgroundColor = this.properties.borderColor || "#FF0000";
                const colorInput = document.createElement("input");
                colorInput.type = "color"; colorInput.value = this.properties.borderColor || "#FF0000"; colorInput.style.display = "none";
                preview.addEventListener("click", () => colorInput.click());
                colorInput.addEventListener("input", (e) => {
                    this.properties.borderColor = e.target.value;
                    preview.style.backgroundColor = e.target.value;
                    this.setDirtyCanvas(true, true);
                });
                container.appendChild(preview); container.appendChild(colorInput);
                return container;
            });
            
            const okButton = document.createElement("button");
            okButton.textContent = "OK";
            okButton.style.marginTop = "15px";
            okButton.style.padding = "8px 20px";
            okButton.style.background = "#6ABF70";
            okButton.style.color = "#fff";
            okButton.style.border = "none";
            okButton.style.borderRadius = "4px";
            okButton.style.cursor = "pointer";
            okButton.style.width = "100%";
            okButton.addEventListener("click", closeDialog);
            dialog.appendChild(okButton);
            document.body.appendChild(dialog);
            
            requestAnimationFrame(() => {
                const canvas = LGraphCanvas.active_canvas?.canvas;
                if (!canvas) return;
                
                const canvasRect = canvas.getBoundingClientRect();
                const ds = LGraphCanvas.active_canvas.ds;
                
                const nodeRightScreenX = canvasRect.left + (this.pos[0] + this.size[0] + ds.offset[0]) * ds.scale;
                const nodeLeftScreenX = canvasRect.left + (this.pos[0] + ds.offset[0]) * ds.scale;
                const nodeBottomScreenY = canvasRect.top + (this.pos[1] + this.size[1] + ds.offset[1]) * ds.scale;
                
                const dialogWidth = dialog.offsetWidth;
                const dialogHeight = dialog.offsetHeight;
                const margin = 10;
                
                let leftPos = nodeRightScreenX + margin;
                let topPos = nodeBottomScreenY + margin;
                
                if (leftPos + dialogWidth > window.innerWidth - margin) {
                    leftPos = nodeLeftScreenX - dialogWidth - margin;
                }
                if (topPos + dialogHeight > window.innerHeight - margin) {
                    topPos = Math.max(margin, window.innerHeight - dialogHeight - margin);
                }
                if (leftPos < margin) {
                    leftPos = Math.max(margin, window.innerWidth / 2 - dialogWidth / 2);
                }
                
                dialog.style.left = leftPos + "px";
                dialog.style.top = topPos + "px";
            });
        };
        
        nodeType.prototype.getHelp = function() {
            return `<p>The 🦊 RS Label node allows you to add a floating label to your workflow.</p>
            <p>Double-click the node to open settings and customize font, colors, and layout.</p>
            <ul><li><strong>Pro tip #1:</strong> Use Enter for multiline text in the textarea.</li>
            <li><strong>Pro tip #2:</strong> Right-click → Pin to make clicks pass through the label.</li></ul>`;
        };
        
        nodeType.title_mode = LiteGraph.NO_TITLE;
    },
    
    async setup(app) {
        const oldDrawNode = LGraphCanvas.prototype.drawNode;
        
        LGraphCanvas.prototype.drawNode = function(node, ctx) {
            if (node.comfyClass === "RSLabel" || node.type === "RSLabel") {
                node.color = "#fff0";
                node.bgcolor = "#fff0";
                node.shadow_color = "transparent";
                
                if (node.drawLabel) {
                    node.drawLabel(ctx);
                }
                return;
            }
            return oldDrawNode.apply(this, arguments);
        };
        
        const oldGetNodeOnPos = LGraph.prototype.getNodeOnPos;
        LGraph.prototype.getNodeOnPos = function(x, y, nodes_list) {
            if (nodes_list && rgthree.processingMouseDown && 
                rgthree.lastCanvasMouseEvent && 
                rgthree.lastCanvasMouseEvent.type.includes("down") &&
                rgthree.lastCanvasMouseEvent.which === 1) {
                
                const isDoubleClick = LiteGraph.getTime() - LGraphCanvas.active_canvas.last_mouseclick < 300;
                if (!isDoubleClick) {
                    nodes_list = [...nodes_list].filter((n) => {
                        return !(n.comfyClass === "RSLabel" && n.flags && n.flags.pinned);
                    });
                }
            }
            return oldGetNodeOnPos.apply(this, [x, y, nodes_list]);
        };
        
        document.addEventListener("mousedown", () => { rgthree.processingMouseDown = true; });
        document.addEventListener("mouseup", () => { rgthree.processingMouseDown = false; });
    }
});