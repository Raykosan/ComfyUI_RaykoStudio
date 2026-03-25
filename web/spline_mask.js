console.log("[SPLINE 🦊] spline_mask.js LOADED!");
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RaykoSplineMask",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RaykoSplineMask") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            try {
                onNodeCreated?.apply(this, arguments);
                const node = this;
                
                node.image = new Image();
                node.imageReady = false;
                node.currentStatus = "Ready";
                node.buttons = [];
                node.imageList = [];
                node.selectedImage = "";
                
                const coordsWidget = node.widgets?.find(w => w.name === "coordinates");
                if (coordsWidget) {
                    coordsWidget.hidden = true;
                    coordsWidget.serializeValue = () => {
                        return node.properties?.spline_coords || "[]";
                    };
                }
                
                const imageWidget = node.widgets?.find(w => w.name === "image");
                if (imageWidget) {
                    imageWidget.hidden = true;
                    if (node.properties?.selected_image) {
                        imageWidget.value = node.properties.selected_image;
                    }
                }
                
                node.padding = 10;
                node.targetWidth = 450;
                node.buttonPositions = [];
                 
                node.buttons = [
                    { label: "🎨 IMAGE", color: "#2196F3", callback: () => node.showImageSelector(), hover: false },
                    { label: "🖼️ UPLOAD IMAGE", color: "#4CAF50", callback: () => node.triggerFileUpload(), hover: false },
                    { label: "🔴 CLEAR POINTS", color: "#dc3545", callback: () => node.clearPoints(), hover: false }
                ];
                
                node.setSize([node.targetWidth, 600]);
                
                let _points = [];
                let _overlayCanvas = null;
                let _syncRunning = false;
                let _lastRect = null;
                
                if (node.properties?.spline_coords && node.properties.spline_coords !== "[]") {
                    try {
                        const p = JSON.parse(node.properties.spline_coords);
                        if (Array.isArray(p)) _points = p;
                    } catch (e) {}
                }
                
                if (node.properties?.selected_image && node.properties.selected_image !== "") {
                    node.loadImage(node.properties.selected_image);
                }
                
                const updateCoords = () => {
                    const jsonStr = JSON.stringify(_points);
                    node.properties = node.properties || {};
                    node.properties.spline_coords = jsonStr;
                    if (coordsWidget) coordsWidget.value = jsonStr;
                    drawOverlay();
                    node.setDirtyCanvas(true, true);
                };

                node.loadImage = function(imagePath) {
                    if (!imagePath || imagePath === "") {
                        console.log("[SPLINE 🦊] No image path provided");
                        return;
                    }
                    
                    console.log("[SPLINE 🦊] Loading image: ", imagePath);
                    
                    node.selectedImage = imagePath;
                    node.properties = node.properties || {};
                    node.properties.selected_image = imagePath;
                    
                    if (imageWidget) {
                        imageWidget.value = imagePath;
                        console.log("[SPLINE 🦊] Widget value set to: ", imagePath);
                    }
                    
                    let filename = imagePath;
                    let subfolder = "";
                    
                    if (imagePath.includes("/")) {
                        const parts = imagePath.split("/");
                        subfolder = parts[0];
                        filename = parts.slice(1).join("/");
                    }
                    
                    let imgUrl = `/view?filename=${encodeURIComponent(filename)}&type=input`;
                    if (subfolder && subfolder !== "") {
                        imgUrl += `&subfolder=${encodeURIComponent(subfolder)}`;
                    }
                    
                    console.log("[SPLINE 🦊] Image URL: ", imgUrl);
                    
                    node.image.src = imgUrl + "&t=" + Date.now();
                    node.image.onload = () => {
                        console.log("[SPLINE 🦊] Image loaded successfully: ", node.image.width, "x", node.image.height);
                        node.imageReady = true;
                        if (_overlayCanvas) _overlayCanvas.style.display = "block";
                        _lastRect = null;
                        syncPosition();
                        node.setDirtyCanvas(true, true);
                    };
                    node.image.onerror = (err) => {
                        console.error("[SPLINE 🦊] Image load error: ", err);
                        console.error("[SPLINE 🦊] Failed URL: ", imgUrl);
                        node.imageReady = false;
                        node.setDirtyCanvas(true, true);
                    };
                    node.currentStatus = "🎨 Draw mask on image";
                };
                
                node.showImageSelector = function() {
                    const self = this;
                    
                    const existingMenu = document.querySelector('.spline-image-menu');
                    if (existingMenu) existingMenu.remove();
                    
                    fetch("/rayko/spline/images")
                        .then(response => response.json())
                        .then(data => {
                            self.imageList = data.images || [];
                            console.log("[SPLINE 🦊] Found images: ", self.imageList.length);
                            
                            if (!self.imageList.length) {
                                const menu = document.createElement("div");
                                menu.className = 'spline-image-menu';
                                menu.textContent = "No images found in input folder!";
                                menu.style.cssText = `
                                    position: fixed;
                                    background: #1a1a1a;
                                    border: 1px solid #444;
                                    border-radius: 6px;
                                    padding: 15px;
                                    z-index: 10001;
                                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                                    color: #888;
                                `;
                                self.positionMenu(menu, 0);
                                document.body.appendChild(menu);
                                setTimeout(() => menu.remove(), 2000);
                                return;
                            }
                            
                            const menu = document.createElement("div");
                            menu.className = 'spline-image-menu';
                            menu.style.cssText = `
                                position: fixed;
                                background: #1a1a1a;
                                border: 1px solid #444;
                                border-radius: 6px;
                                max-height: 300px;
                                overflow-y: auto;
                                z-index: 10001;
                                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                                min-width: 200px;
                            `;
                            
                            self.imageList.forEach(imgPath => {
                                const item = document.createElement("div");
                                const displayName = imgPath.split('/').pop();
                                item.textContent = displayName;
                                item.title = imgPath;
                                item.style.cssText = `
                                    padding: 10px 15px;
                                    cursor: pointer;
                                    color: #ddd;
                                    font-size: 12px;
                                    border-bottom: 1px solid #333;
                                `;
                                if (imgPath === self.selectedImage) {
                                    item.style.background = "#2a4a2a";
                                    item.style.color = "#4CAF50";
                                }
                                item.onmouseover = () => {
                                    if (imgPath !== self.selectedImage) {
                                        item.style.background = "#333";
                                    }
                                };
                                item.onmouseout = () => {
                                    if (imgPath !== self.selectedImage) {
                                        item.style.background = "#1a1a1a";
                                    }
                                };
                                item.onclick = (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    console.log("[SPLINE 🦊] Selected image: ", imgPath);
                                    self.loadImage(imgPath);
                                    menu.remove();
                                };
                                menu.appendChild(item);
                            });
                            
                            self.positionMenu(menu, 0);
                            document.body.appendChild(menu);
                            
                            const closeHandler = (e) => {
                                if (!menu.contains(e.target)) {
                                    menu.remove();
                                    document.removeEventListener("mousedown", closeHandler);
                                }
                            };
                            setTimeout(() => {
                                document.addEventListener("mousedown", closeHandler);
                            }, 100);
                        })
                        .catch(err => {
                            console.error("[SPLINE 🦊] Error fetching images: ", err);
                            alert("Error loading image list!");
                        });
                };
                
                node.positionMenu = function(menu, buttonIndex) {
                    const canvasEl = app.canvas?.canvas || document.querySelector("canvas");
                    if (!canvasEl || !this.pos) {
                        menu.style.left = "250px";
                        menu.style.top = "200px";
                        return;
                    }
                    
                    const canvasRect = canvasEl.getBoundingClientRect();
                    const ds = app.canvas.ds;
                    
                    const btnY = this.size[1] - 45;
                    const btnW = (this.size[0] - 50) / 3;
                    const btnX = 15 + (buttonIndex * (btnW + 5));
                    
                    const nodeScreenX = canvasRect.left + ((this.pos[0] + ds.offset[0]) * ds.scale);
                    const nodeScreenY = canvasRect.top + ((this.pos[1] + ds.offset[1]) * ds.scale);
                    
                    const menuX = nodeScreenX + btnX;
                    const menuY = nodeScreenY + btnY + 30;
                    
                    menu.style.left = menuX + "px";
                    menu.style.top = menuY + "px";
                };
                
                node.triggerFileUpload = function() {
                    const self = this;
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.style.display = 'none';
                    document.body.appendChild(fileInput);
                    
                    fileInput.addEventListener('change', async (e) => {
                        const file = e.target.files[0];
                        if (!file) {
                            fileInput.remove();
                            return;
                        }
                        
                        console.log("[SPLINE 🦊] Uploading file: ", file.name);
                        
                        const formData = new FormData();
                        formData.append('image', file);
                        formData.append('subfolder', '');
                        formData.append('type', 'input');
                        
                        try {
                            const response = await fetch('/upload/image', {
                                method: 'POST',
                                body: formData
                            });
                            
                            if (response.ok) {
                                const result = await response.json();
                                console.log("[SPLINE 🦊] Upload result: ", result);
                                
                                const imageName = result.name || result.filename;
                                const subfolder = result.subfolder || '';
                                
                                let finalName = imageName;
                                if (subfolder && subfolder !== '') {
                                    finalName = `${subfolder}/${imageName}`;
                                }
                                
                                if (finalName) {
                                    console.log("[SPLINE 🦊] Loading uploaded image: ", finalName);
                                    self.loadImage(finalName);
                                }
                            } else {
                                const errText = await response.text();
                                console.error("[SPLINE 🦊] Upload failed: ", errText);
                                alert("Upload failed: " + errText);
                            }
                        } catch (err) {
                            console.error("[SPLINE 🦊] Upload error: ", err);
                            alert("Upload error: " + err.message);
                        } finally {
                            fileInput.remove();
                        }
                    });
                    
                    fileInput.click();
                };
                
                node.clearPoints = function() {
                    _points = [];
                    updateCoords();
                };
                
                const calculateImageRect = () => {
                    if (!app.canvas) return null;
                    
                    const ds = app.canvas.ds;
                    const canvasEl = app.canvas.canvas;
                    const scale = ds.scale;
                    
                    const graphX = node.pos[0];
                    const graphY = node.pos[1];
                    
                    const canvasRect = canvasEl.getBoundingClientRect();
                    const nodeScreenX = canvasRect.left + ((graphX + ds.offset[0]) * scale);
                    const nodeScreenY = canvasRect.top + ((graphY + ds.offset[1]) * scale);
                    
                    let widgetsTotalHeight = 0;
                    if (node.widgets) {
                        for (const w of node.widgets) {
                            if (!w.hidden && w.type !== "button") {
                                widgetsTotalHeight += (w.computeSize ? w.computeSize(node.size[0])[1] : 20);
                            }
                        }
                    }
                    
                    const titleBarHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
                    const padding = 10;
                    const footerHeight = 50;
                    
                    const availableHeight = (node.size[1] * scale) - (titleBarHeight * scale) - (widgetsTotalHeight * scale) - (footerHeight * scale) - (padding * 2 * scale);
                    const availableWidth = (node.size[0] * scale) - (padding * 2 * scale);
                    
                    if (availableWidth <= 0 || availableHeight <= 0) return null;

                    let drawW = availableWidth;
                    let drawH = availableHeight;
                    let contentScale = 1;
                    
                    if (node.imageReady && node.image) {
                        const imgRatio = node.image.width / node.image.height;
                        
                        if (availableWidth / availableHeight > imgRatio) {
                            drawH = availableHeight;
                            drawW = drawH * imgRatio;
                        } else {
                            drawW = availableWidth;
                            drawH = drawW / imgRatio;
                        }
                        
                        contentScale = drawW / node.image.width;
                    }
                    
                    const drawX = nodeScreenX + (padding * scale) + ((availableWidth - drawW) / 2);
                    const drawY = nodeScreenY + (titleBarHeight * scale) + (widgetsTotalHeight * scale) + (padding * scale) + ((availableHeight - drawH) / 2);
                    
                    return {
                        left: drawX,
                        top: drawY,
                        width: drawW,
                        height: drawH,
                        scale: contentScale
                    };
                };
                
                const startSyncLoop = () => {
                    if (_syncRunning) return;
                    _syncRunning = true;
                    const syncLoop = () => {
                        if (!_syncRunning) return;
                        syncPosition();
                        if (_overlayCanvas) requestAnimationFrame(syncLoop);
                        else _syncRunning = false;
                    };
                    requestAnimationFrame(syncLoop);
                };

                const syncPosition = () => {
                    if (!_overlayCanvas) return;
                    const imgRect = calculateImageRect();
                    if (!imgRect) return;
                    
                    const hasChanged = !_lastRect || 
                        Math.abs(_lastRect.left - imgRect.left) > 0.5 ||
                        Math.abs(_lastRect.top - imgRect.top) > 0.5 ||
                        Math.abs(_lastRect.width - imgRect.width) > 0.5 ||
                        Math.abs(_lastRect.height - imgRect.height) > 0.5;
                    
                    if (hasChanged) {
                        _lastRect = { ...imgRect };
                        _overlayCanvas.style.left = `${imgRect.left}px`;
                        _overlayCanvas.style.top = `${imgRect.top}px`;
                        _overlayCanvas.style.width = `${imgRect.width}px`;
                        _overlayCanvas.style.height = `${imgRect.height}px`;
                        _overlayCanvas.dataset.scale = imgRect.scale;
                        drawOverlay();
                    }
                };
                
                const createOverlayCanvas = () => {
                    if (_overlayCanvas) return;
                    _overlayCanvas = document.createElement("canvas");
                    _overlayCanvas.style.cssText = `
                        position: fixed !important; z-index: 1001 !important;
                        pointer-events: auto !important; cursor: crosshair !important;
                        background: transparent !important; touch-action: none;
                        border: 1px dashed #00FF00 !important; box-sizing: border-box !important;
                        display: none;
                    `;
                    _overlayCanvas.dataset.nodeType = "RaykoSplineMask";
                    document.body.appendChild(_overlayCanvas);
                    
                    _overlayCanvas.addEventListener("mousedown", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = _overlayCanvas.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        const scale = parseFloat(_overlayCanvas.dataset.scale || "1");
                        const imgX = x / scale;
                        const imgY = y / scale;
                        
                        if (e.button === 2 || e.ctrlKey) {
                            let removed = false;
                            for (let i = _points.length - 1; i >= 0; i--) {
                                const dist = Math.hypot(_points[i].x - imgX, _points[i].y - imgY);
                                if (dist < 15 / scale) {
                                    _points.splice(i, 1);
                                    removed = true;
                                    break;
                                }
                            }
                            if (removed) updateCoords();
                        } else if (e.button === 0) {
                            if (_points.length >= 3) {
                                const distToFirst = Math.hypot(_points[0].x - imgX, _points[0].y - imgY);
                                if (distToFirst < 20 / scale) {
                                    updateCoords();
                                    return;
                                }
                            }
                            _points.push({ x: imgX, y: imgY });
                            updateCoords();
                        }
                    });
                    startSyncLoop();
                };
                 
                const drawOverlay = () => {
                    if (!_overlayCanvas || !_lastRect) return;
                    const width = parseFloat(_overlayCanvas.style.width || "0");
                    const height = parseFloat(_overlayCanvas.style.height || "0");
                    if (width <= 0 || height <= 0) return;
                    
                    const dpr = window.devicePixelRatio || 1;
                    _overlayCanvas.width = width * dpr;
                    _overlayCanvas.height = height * dpr;
                    const ctx = _overlayCanvas.getContext("2d");
                    ctx.scale(dpr, dpr);
                    ctx.clearRect(0, 0, width, height);
                    
                    const scale = parseFloat(_overlayCanvas.dataset.scale || "1");
                    if (_points.length >= 1) {
                        ctx.beginPath();
                        ctx.moveTo(_points[0].x * scale, _points[0].y * scale);
                        for (let i = 1; i < _points.length; i++) {
                            ctx.lineTo(_points[i].x * scale, _points[i].y * scale);
                        }
                        if (_points.length >= 3) {
                            ctx.closePath();
                            ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
                            ctx.fill();
                        }
                        ctx.strokeStyle = "#0f0";
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        for (const p of _points) {
                            ctx.beginPath();
                            ctx.arc(p.x * scale, p.y * scale, 4, 0, Math.PI * 2);
                            ctx.fillStyle = "#f00";
                            ctx.fill();
                            ctx.strokeStyle = "#fff";
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }
                    }
                };
                
                node.onDrawForeground = function(ctx) {
                    if (!this.flags.collapsed) {
                        const [w, h] = this.size;
                        
                        let widgetsTotalHeight = 0;
                        if (this.widgets) {
                            for (const widget of this.widgets) {
                                if (!widget.hidden && widget.type !== "button") {
                                    widgetsTotalHeight += (widget.computeSize ? widget.computeSize(w)[1] : 20);
                                }
                            }
                        }
                        
                        const titleBarHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
                        const padding = 10;
                        const footerHeight = 50;
                        const btnH = 28;
                        const btnY = h - 45;
                        const btnW = (w - 50) / 3;
                        
                        const startY = titleBarHeight + widgetsTotalHeight + padding;
                        const availableHeight = h - startY - footerHeight - padding;
                        const availableWidth = w - (padding * 2);
                        
                        if (this.imageReady && this.image) {
                            const imgRatio = this.image.width / this.image.height;
                            let drawW, drawH;
                            
                            if (availableWidth / availableHeight > imgRatio) {
                                drawH = availableHeight;
                                drawW = drawH * imgRatio;
                            } else {
                                drawW = availableWidth;
                                drawH = drawW / imgRatio;
                            }
                            
                            const drawX = padding + (availableWidth - drawW) / 2;
                            const drawY = startY + (availableHeight - drawH) / 2;
                            
                            ctx.drawImage(this.image, drawX, drawY, drawW, drawH);
                            
                            ctx.strokeStyle = "#444";
                            ctx.lineWidth = 1;
                            ctx.strokeRect(drawX, drawY, drawW, drawH);
                        } else {
                            ctx.fillStyle = "#222";
                            ctx.fillRect(padding, startY, availableWidth, availableHeight);
                            ctx.fillStyle = "#555";
                            ctx.font = "14px Arial";
                            ctx.textAlign = "center";
                            ctx.fillText("Select or Upload Image...", w / 2, startY + availableHeight / 2);
                        }
                        
                        this.buttonPositions = [];
                        
                        for (let i = 0; i < this.buttons.length; i++) {
                            let btn = this.buttons[i];
                            btn.x = 15 + (i * (btnW + 5));
                            btn.y = btnY;
                            btn.w = btnW;
                            btn.h = btnH;
                            
                            this.buttonPositions.push({ x: btn.x, y: btn.y, w: btn.w, h: btn.h });

                            ctx.fillStyle = btn.hover ? "#444" : "#2a2a2a";
                            ctx.beginPath();
                            if (ctx.roundRect) ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 6);
                            else ctx.rect(btn.x, btn.y, btn.w, btn.h);
                            ctx.fill();
                            ctx.lineWidth = 1;
                            ctx.strokeStyle = btn.color;
                            ctx.stroke();
                            ctx.fillStyle = btn.color;
                            ctx.font = "bold 11px Arial";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
                            if (btn.hover) app.canvas.canvas.style.cursor = "pointer";
                        }
                    }
                };
                
                const onResize = node.onResize;
                node.onResize = function(size) {
                    if (onResize) onResize.apply(this, arguments);
                    _lastRect = null;
                };
                
                const onMove = node.onMove;
                node.onMove = function() {
                    if (onMove) onMove.apply(this, arguments);
                    _lastRect = null;
                };
                
                node.onMouseMove = function(event, pos, graphPos) {
                    const [x, y] = pos;
                    let needsRedraw = false;
                    for (let btn of this.buttons) {
                        const isOver = x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
                        if (btn.hover !== isOver) { btn.hover = isOver; needsRedraw = true; }
                    }
                    if (needsRedraw) this.setDirtyCanvas(true, false);
                };
                
                node.onMouseDown = function(event, pos, graphPos) {
                    const [x, y] = pos;
                    for (let btn of this.buttons) {
                        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                            btn.callback();
                            return true;
                        }
                    }
                    return false;
                };
                
                node.onRemoved = function() {
                    console.log(`[SPLINE 🦊] Node ${this.id} removed, cleaning up...`);
                    
                    _syncRunning = false;
                    if (_overlayCanvas) { 
                        _overlayCanvas.remove(); 
                        _overlayCanvas = null; 
                    }
                    
                    const existingMenu = document.querySelector('.spline-image-menu');
                    if (existingMenu) existingMenu.remove();
                };
                
                createOverlayCanvas();
                
            } catch (error) {
                console.error("[SPLINE 🦊] Critical Error: ", error);
                console.error(error.stack);
            }
        };
    },

    setup() {
        // Empty - all handlers inside onNodeCreated
    }
});