import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.ImageText",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "LoadImageWithText") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function() {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            
            node.data = {
                mode: "read",
                prefix: "Civitai/prompt",
                text: "",
                selected_image: ""
            };
            
            const MIN_WIDTH = 360;
            const MIN_HEIGHT = 520;
            const PREVIEW_FIXED_HEIGHT = 250;
            
            node.MIN_WIDTH = MIN_WIDTH;
            node.MIN_HEIGHT = MIN_HEIGHT;
            node.setSize([MIN_WIDTH, MIN_HEIGHT]);
            
            const w_mode = node.widgets?.find(w => w.name === "mode");
            const w_prefix = node.widgets?.find(w => w.name === "filename_prefix");
            const w_text = node.widgets?.find(w => w.name === "text_input");
            const w_image = node.widgets?.find(w => w.name === "image");

            const syncWidget = (widget, dataKey) => {
                if (widget) {
                    widget.value = node.data[dataKey];
                    widget.serializeValue = () => node.data[dataKey];
                }
            };

            if (node.widgets) {
                node.widgets.forEach(w => {
                    if (w.name === "mode" && w.value) node.data.mode = w.value;
                    if (w.name === "filename_prefix" && w.value) node.data.prefix = w.value;
                    if (w.name === "text_input" && w.value) node.data.text = w.value;
                    if (w.name === "image" && w.value) node.data.selected_image = w.value;
                    
                    w.hidden = true;
                    w.type = "hidden";
                    w.computeSize = () => [0, 0];
                    w.computedHeight = 0;
                    w.draw = function() {};
                    
                    if (w.element && w.element.parentNode) {
                        w.element.parentNode.removeChild(w.element);
                    }

                    w.serializeValue = () => {
                        if (w.name === "mode") return node.data.mode;
                        if (w.name === "filename_prefix") return node.data.prefix;
                        if (w.name === "text_input") return node.data.text;
                        if (w.name === "image") return node.data.selected_image;
                        return w.value;
                    };
                });
            }

            node.syncData = function() {
                if (node.graph) {
                    node.graph.setDirtyCanvas(true, true);
                    node.graph.changeTracker?.dispatchEvent(new Event("change"));
                }
            };

            node.image = new Image();
            node.imageLoaded = false;
            node.imageLoading = false;
            node.dragOver = false;
            
            node.loadImage = function(imagePath) {
                if (!imagePath || node.imageLoading) return;
                
                node.imageLoading = true;
                node.data.selected_image = imagePath;
                syncWidget(w_image, 'selected_image');
                
                let filename = imagePath;
                let subfolder = "";
                if (imagePath.includes("/")) {
                    const parts = imagePath.split("/");
                    subfolder = parts[0];
                    filename = parts.slice(1).join("/");
                }
                
                let imgUrl = `/view?filename=${encodeURIComponent(filename)}&type=input`;
                if (subfolder) imgUrl += `&subfolder=${encodeURIComponent(subfolder)}`;
                imgUrl += `&t=${Date.now()}`;
                
                const img = new Image();
                img.onload = () => {
                    node.image = img;
                    node.imageLoaded = true;
                    node.imageLoading = false;
                    node.syncData();
                };
                img.onerror = () => {
                    node.imageLoaded = false;
                    node.imageLoading = false;
                    node.syncData();
                };
                img.src = imgUrl;
            };
            
            const uploadFileAndLoad = async (file) => {
                if (!file || !file.type.startsWith('image/')) return false;
                const formData = new FormData();
                formData.append('image', file);
                formData.append('subfolder', '');
                formData.append('type', 'input');
                
                try {
                    const response = await fetch('/upload/image', { method: 'POST', body: formData });
                    if (response.ok) {
                        const result = await response.json();
                        const imageName = result.name || result.filename;
                        const subfolder = result.subfolder || '';
                        const finalName = subfolder ? `${subfolder}/${imageName}` : imageName;
                        node.loadImage(finalName);
                        return true;
                    }
                } catch (err) {
                    console.error("[RS Image-Text] Upload error:", err);
                }
                return false;
            };
            
            node.triggerFileUpload = function() {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/png, image/jpeg, image/webp, image/bmp';
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    await uploadFileAndLoad(file);
                    fileInput.remove();
                };
                fileInput.click();
            };
            
            const handleCanvasDrop = (e) => {
                if (!e.dataTransfer || !e.dataTransfer.files.length) return;
                const rect = app.canvas.canvas.getBoundingClientRect();
                const ds = app.canvas.ds;
                const nodeX = rect.left + ((node.pos[0] + ds.offset[0]) * ds.scale);
                const nodeY = rect.top + ((node.pos[1] + ds.offset[1]) * ds.scale);
                const nodeW = node.size[0] * ds.scale;
                const nodeH = node.size[1] * ds.scale;
                
                if (e.clientX >= nodeX && e.clientX <= nodeX + nodeW && 
                    e.clientY >= nodeY && e.clientY <= nodeY + nodeH) {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                        uploadFileAndLoad(file);
                    }
                }
            };
            
            const handleCanvasDragOver = (e) => {
                if (!e.dataTransfer || !e.dataTransfer.files.length) return;
                const rect = app.canvas.canvas.getBoundingClientRect();
                const ds = app.canvas.ds;
                const nodeX = rect.left + ((node.pos[0] + ds.offset[0]) * ds.scale);
                const nodeY = rect.top + ((node.pos[1] + ds.offset[1]) * ds.scale);
                const nodeW = node.size[0] * ds.scale;
                const nodeH = node.size[1] * ds.scale;
                
                if (e.clientX >= nodeX && e.clientX <= nodeX + nodeW && 
                    e.clientY >= nodeY && e.clientY <= nodeY + nodeH) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            
            app.canvas.canvas.addEventListener('dragover', handleCanvasDragOver, { capture: true });
            app.canvas.canvas.addEventListener('drop', handleCanvasDrop, { capture: true });

            const updateUIFromData = () => {
                if (prefixInput) prefixInput.value = node.data.prefix || "";
                if (customTextArea) customTextArea.value = node.data.text || "";
                updateModeVisuals();
            };

            node.onSerialize = function(o) {
                syncWidget(w_mode, 'mode');
                syncWidget(w_prefix, 'prefix');
                syncWidget(w_text, 'text');
                syncWidget(w_image, 'selected_image');
                o.data = node.data;
            };
            
            node.onConfigure = function(o) {
                if (o && o.data) {
                    node.data = { ...node.data, ...o.data };
                }
    
                node.imageLoading = false;
                node.imageLoaded = false;
    
                if (node.data.selected_image) {
                    node.loadImage(node.data.selected_image);
                }
    
                updateUIFromData();
    
                syncWidget(w_mode, 'mode');
                syncWidget(w_prefix, 'prefix');
                syncWidget(w_text, 'text');
                syncWidget(w_image, 'selected_image');
            };
            
            node.visibilityHandler = function() {
                if (!document.hidden && node.graph) {
                    node.graph.setDirtyCanvas(true, true);
                    node.syncData();
                }
            };
            document.addEventListener("visibilitychange", node.visibilityHandler);
            
            const mainContainer = document.createElement("div");
            mainContainer.style.cssText = `
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 0 !important;
                margin: 0 !important;
                box-sizing: border-box;
                pointer-events: none;
            `;

            const modeContainer = document.createElement("div");
            modeContainer.style.cssText = "display:flex; gap:8px; width:100%; pointer-events: auto;";
            
            const createModeBtn = (label, value) => {
                const btn = document.createElement("button");
                btn.textContent = label;
                btn.style.cssText = `flex:1; height:28px; padding:0 12px; border:2px solid #555; border-radius:4px; font-weight:normal; cursor:pointer; transition:all 0.2s; font-size:12px; pointer-events: auto;`;
                btn.onclick = () => {
                    node.data.mode = value;
                    syncWidget(w_mode, 'mode');
                    updateModeVisuals();
                    node.syncData();
                };
                return btn;
            };
            const btnRead = createModeBtn("📄 READ from IMAGE", "read");
            const btnWrite = createModeBtn("✏️ WRITE to IMAGE", "write");
            modeContainer.appendChild(btnRead);
            modeContainer.appendChild(btnWrite);
            
            const updateModeVisuals = () => {
                const isRead = node.data.mode === "read";
                btnRead.style.backgroundColor = isRead ? "#4CAF50" : "#333";
                btnRead.style.borderColor = isRead ? "#81C784" : "#555";
                btnRead.style.color = isRead ? "#fff" : "#aaa";
                btnWrite.style.backgroundColor = !isRead ? "#2196F3" : "#333";
                btnWrite.style.borderColor = !isRead ? "#64B5F6" : "#555";
                btnWrite.style.color = !isRead ? "#fff" : "#aaa";
            };
            updateModeVisuals();

            const prefixContainer = document.createElement("div");
            prefixContainer.style.cssText = "display:flex; align-items:center; gap:8px; width:100%; pointer-events: auto;";
            
            const prefixLabel = document.createElement("label");
            prefixLabel.textContent = "PREFIX:";
            prefixLabel.style.cssText = "color:#aaa; font-size:14px; font-weight:normal; white-space:nowrap; pointer-events: auto; cursor:default;";
            
            const prefixInput = document.createElement("input");
            prefixInput.type = "text";
            prefixInput.value = node.data.prefix;
            prefixInput.style.cssText = "flex:1; height:28px; padding:0 12px; background:#222; color:#eee; border:1px solid #444; border-radius:4px; font-size:14px; box-sizing:border-box; pointer-events: auto;";
            
            prefixInput.oninput = () => {
                node.data.prefix = prefixInput.value;
                syncWidget(w_prefix, 'prefix');
                node.syncData();
            };
            
            prefixContainer.appendChild(prefixLabel);
            prefixContainer.appendChild(prefixInput);

            const textContainer = document.createElement("div");
            textContainer.style.cssText = "width:100%; pointer-events: auto;";
            
            const customTextArea = document.createElement("textarea");
            customTextArea.value = node.data.text;
            customTextArea.placeholder = "Enter text here...";
            customTextArea.style.cssText = "width:100%; min-height:50px; padding:6px; background:#222; color:#eee; border:1px solid #444; border-radius:4px; resize: none; font-family:monospace; font-size:12px; box-sizing:border-box; pointer-events: auto;";
            
            customTextArea.oninput = () => {
                node.data.text = customTextArea.value;
                syncWidget(w_text, 'text');
                node.syncData();
            };
            textContainer.appendChild(customTextArea);

            const buttonsContainer = document.createElement("div");
            buttonsContainer.style.cssText = "display:flex; gap:8px; width:100%; pointer-events: auto;";
            
            const btnUpload = document.createElement("button");
            btnUpload.textContent = "📂 UPLOAD IMAGE";
            btnUpload.style.cssText = "flex:1; height:28px; background:#2a2a2a; color:#4CAF50; border:2px solid #4CAF50; border-radius:4px; cursor:pointer; font-weight:normal; font-size:12px; transition:all 0.2s; pointer-events: auto;";
            btnUpload.onmouseover = () => { btnUpload.style.backgroundColor = "#3a3a3a"; };
            btnUpload.onmouseout = () => { btnUpload.style.backgroundColor = "#2a2a2a"; };
            btnUpload.onclick = () => node.triggerFileUpload();
            
            const btnClear = document.createElement("button");
            btnClear.textContent = "🗑️ CLEAR TEXT";
            btnClear.style.cssText = "flex:1; height:28px; background:#2a2a2a; color:#dc3545; border:2px solid #dc3545; border-radius:4px; cursor:pointer; font-weight:normal; font-size:12px; transition:all 0.2s; pointer-events: auto;";
            btnClear.onmouseover = () => { btnClear.style.backgroundColor = "#3a3a3a"; };
            btnClear.onmouseout = () => { btnClear.style.backgroundColor = "#2a2a2a"; };
            btnClear.onclick = () => {
                node.data.text = "";
                customTextArea.value = "";
                syncWidget(w_text, 'text');
                node.syncData();
            };
            
            buttonsContainer.appendChild(btnUpload);
            buttonsContainer.appendChild(btnClear);

            mainContainer.appendChild(modeContainer);
            mainContainer.appendChild(prefixContainer);
            mainContainer.appendChild(textContainer);
            mainContainer.appendChild(buttonsContainer);
            
            node.addDOMWidget("custom_widgets", "customtext", mainContainer);

            node.customTextArea = customTextArea;

            const originalOnResize = node.onResize;
            node.onResize = function(size) {
                if (size[0] < MIN_WIDTH) size[0] = MIN_WIDTH;
                if (size[1] < MIN_HEIGHT) size[1] = MIN_HEIGHT;
                
                const titleBarHeight = 30;
                const topPadding = 18;
                const gap = 8;
                const bottomPadding = 20;
                const previewSpacing = 35;
                
                const fixedElements = titleBarHeight + topPadding + 
                                     28 + gap + 28 + gap +
                                     gap + 28 +
                                     previewSpacing +
                                     PREVIEW_FIXED_HEIGHT +
                                     bottomPadding;
                
                const textareaHeight = Math.max(50, size[1] - fixedElements);
                
                if (customTextArea) {
                    customTextArea.style.height = textareaHeight + 'px';
                }
                
                if (originalOnResize) originalOnResize.apply(this, arguments);
                node.setDirtyCanvas(true, true);
            };
            
            node.onDrawBackground = function(ctx) {
                const w = this.size[0];
                const h = this.size[1];
                const radius = 8;
    
                ctx.beginPath();
                ctx.moveTo(radius, 0);
                ctx.lineTo(w - radius, 0);
                ctx.quadraticCurveTo(w, 0, w, radius);
                ctx.lineTo(w, h - radius);
                ctx.quadraticCurveTo(w, h, w - radius, h);
                ctx.lineTo(radius, h);
                ctx.quadraticCurveTo(0, h, 0, h - radius);
                ctx.lineTo(0, radius);
                ctx.quadraticCurveTo(0, 0, radius, 0);
                ctx.closePath();
    
                ctx.fillStyle = "#353535";
                ctx.fill();
            };
            
            node.onDrawForeground = function(ctx) {
                if (this.flags.collapsed) return;
                const [w, h] = this.size;
                
                const leftRightPadding = 10;
                const bottomPadding = 20;
                const previewSpacing = 35;
                
                const previewY = h - bottomPadding - PREVIEW_FIXED_HEIGHT;
                const previewWidth = w - (leftRightPadding * 2);
                
                if (this.imageLoaded && this.image) {
                    const imgRatio = this.image.width / this.image.height;
                    let drawW, drawH;
                    
                    if (previewWidth / PREVIEW_FIXED_HEIGHT > imgRatio) {
                        drawH = PREVIEW_FIXED_HEIGHT;
                        drawW = drawH * imgRatio;
                    } else {
                        drawW = previewWidth;
                        drawH = drawW / imgRatio;
                    }
                    
                    const drawX = leftRightPadding + (previewWidth - drawW) / 2;
                    const drawY = previewY + (PREVIEW_FIXED_HEIGHT - drawH) / 2;
                    
                    ctx.drawImage(this.image, drawX, drawY, drawW, drawH);
                    ctx.strokeStyle = this.dragOver ? "#4CAF50" : "#444";
                    ctx.lineWidth = this.dragOver ? 2 : 1;
                    ctx.strokeRect(drawX, drawY, drawW, drawH);
                    
                    ctx.fillStyle = "#888";
                    ctx.font = "15px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "bottom";
                    ctx.fillText(`${this.image.width} × ${this.image.height}`, w / 2, previewY - 5);
                } else {
                    ctx.fillStyle = "#1a1a1a";
                    ctx.fillRect(leftRightPadding, previewY, previewWidth, PREVIEW_FIXED_HEIGHT);
                    ctx.strokeStyle = this.dragOver ? "#4CAF50" : "#333";
                    ctx.lineWidth = this.dragOver ? 2 : 1;
                    ctx.strokeRect(leftRightPadding, previewY, previewWidth, PREVIEW_FIXED_HEIGHT);
                    
                    ctx.fillStyle = "#555";
                    ctx.font = "14px Arial";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("Drop Image Here", w / 2, previewY + PREVIEW_FIXED_HEIGHT / 2);
                }
            };
            
            node.onMouseMove = function() {};
            node.onMouseDown = function() { return false; };
            
            const originalOnRemoved = node.onRemoved;
            node.onRemoved = function() {
                document.removeEventListener("visibilitychange", node.visibilityHandler);
                app.canvas.canvas.removeEventListener('dragover', handleCanvasDragOver, { capture: true });
                app.canvas.canvas.removeEventListener('drop', handleCanvasDrop, { capture: true });
                if (originalOnRemoved) originalOnRemoved.apply(this, arguments);
            };
            
            if (node.data.selected_image) {
                node.loadImage(node.data.selected_image);
            }
            
            requestAnimationFrame(() => {
                node.onResize([MIN_WIDTH, MIN_HEIGHT]);
            });
            
            return result;
        };
    },
    setup() {}
});