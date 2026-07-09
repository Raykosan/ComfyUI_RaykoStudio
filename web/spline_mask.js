// SPDX-License-Identifier: Apache-2.0
// Copyright 2025-2026 Raykosan (RaykoStudio)
console.log("[SPLINE 🦊] spline_mask.js LOADED!");
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RaykoSplineMask",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RaykoSplineMask") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function() {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            
            node.data = {
                selected_image: "",
                spline_coords: "[]"
            };
            
            node.targetWidth = 450;
            node.setSize([node.targetWidth, 600]);
            
            const imageWidget = node.widgets?.find(w => w.name === "image");
            const coordsWidget = node.widgets?.find(w => w.name === "coordinates");
            
            if (imageWidget) {
                imageWidget.hidden = true;
                if (imageWidget.element) imageWidget.element.style.display = "none";
            }
            if (coordsWidget) {
                coordsWidget.hidden = true;
                if (coordsWidget.element) coordsWidget.element.style.display = "none";
            }
            
            if (imageWidget && imageWidget.value) node.data.selected_image = imageWidget.value;
            if (coordsWidget && coordsWidget.value) node.data.spline_coords = coordsWidget.value;
            
            if (imageWidget) {
                imageWidget.serializeValue = () => node.data.selected_image;
            }
            if (coordsWidget) {
                coordsWidget.serializeValue = () => node.data.spline_coords;
            }
            
            node.image = new Image();
            node.imageLoaded = false;
            node.imageLoading = false;
            node.buttons = [];
            node.imageList = [];
            
            node.buttons = [
                { label: "🎨 IMAGE", color: "#2196F3", callback: () => node.showImageSelector(), hover: false },
                { label: "🖼️ UPLOAD", color: "#4CAF50", callback: () => node.triggerFileUpload(), hover: false },
                { label: "🔴 CLEAR", color: "#dc3545", callback: () => node.clearPoints(), hover: false }
            ];
            
            let _points = [];
            try {
                const savedPoints = JSON.parse(node.data.spline_coords);
                if (Array.isArray(savedPoints)) _points = savedPoints;
            } catch (e) {}
            
            let _overlayCanvas = null;
            let _animationId = null;
            let _lastRect = null;
            
            const syncData = () => {
                node.data.spline_coords = JSON.stringify(_points);
                if (coordsWidget) coordsWidget.value = node.data.spline_coords;
                if (node.graph) node.graph.changeTracker?.dispatchEvent(new Event("change"));
                drawOverlay();
                node.setDirtyCanvas(true, true);
            };
            
            node.loadImage = function(imagePath) {
                if (!imagePath || node.imageLoading) return;
                
                node.imageLoading = true;
                node.data.selected_image = imagePath;
                if (imageWidget) imageWidget.value = imagePath;
                
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
                    if (_overlayCanvas) _overlayCanvas.style.display = "block";
                    _lastRect = null;
                    syncPosition();
                    node.setDirtyCanvas(true, true);
                    if (node.graph) node.graph.changeTracker?.dispatchEvent(new Event("change"));
                };
                img.onerror = () => {
                    node.imageLoaded = false;
                    node.imageLoading = false;
                    node.setDirtyCanvas(true, true);
                };
                img.src = imgUrl;
            };
            
            const uploadFileAndLoad = async (file) => {
                if (!file || !file.type.startsWith('image/')) {
                    console.log("[SPLINE 🦊] Not an image file");
                    return false;
                }
                
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
                    console.error("[SPLINE 🦊] Upload error:", err);
                }
                return false;
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
                        console.log("[SPLINE 🦊] Canvas intercepted drop for node:", file.name);
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
            
            node.showImageSelector = function() {
                const self = this;
                const existingMenu = document.querySelector('.spline-image-menu');
                if (existingMenu) existingMenu.remove();
                
                fetch("/rayko/spline/images")
                    .then(response => response.json())
                    .then(data => {
                        self.imageList = data.images || [];
                        if (!self.imageList.length) {
                            alert("No images found!");
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
                            item.style.cssText = `
                                padding: 10px 15px;
                                cursor: pointer;
                                color: #ddd;
                                font-size: 12px;
                                border-bottom: 1px solid #333;
                                background: ${imgPath === self.data.selected_image ? '#333' : '#1a1a1a'};
                            `;
                            item.onmouseover = () => item.style.background = "#444";
                            item.onmouseout = () => item.style.background = imgPath === self.data.selected_image ? '#333' : "#1a1a1a";
                            item.onclick = (e) => {
                                e.stopPropagation();
                                self.loadImage(imgPath);
                                menu.remove();
                            };
                            menu.appendChild(item);
                        });
                        
                        self.positionMenu(menu, 0);
                        document.body.appendChild(menu);
                        
                        const closeHandler = (e) => {
                            if (!menu.contains(e.target)) menu.remove();
                        };
                        setTimeout(() => document.addEventListener("mousedown", closeHandler), 100);
                    })
                    .catch(err => console.error(err));
            };
            
            node.positionMenu = function(menu, buttonIndex) {
                const canvasEl = app.canvas?.canvas;
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
                
                menu.style.left = (nodeScreenX + btnX) + "px";
                menu.style.top = (nodeScreenY + btnY + 30) + "px";
            };
            
            node.triggerFileUpload = function() {
                const self = this;
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    await uploadFileAndLoad(file);
                    fileInput.remove();
                };
                fileInput.click();
            };
            
            node.clearPoints = function() {
                _points = [];
                syncData();
            };
            
            const calculateImageRect = () => {
                if (!app.canvas) return null;
                
                const ds = app.canvas.ds;
                const scale = ds.scale;
                const graphX = node.pos[0];
                const graphY = node.pos[1];
                const canvasRect = app.canvas.canvas.getBoundingClientRect();
                
                const nodeScreenX = canvasRect.left + ((graphX + ds.offset[0]) * scale);
                const nodeScreenY = canvasRect.top + ((graphY + ds.offset[1]) * scale);
                
                let widgetsHeight = 0;
                if (node.widgets) {
                    for (const w of node.widgets) {
                        if (!w.hidden) widgetsHeight += 20;
                    }
                }
                
                const titleBarHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
                const padding = 10;
                const footerHeight = 50;
                
                const availableHeight = (node.size[1] * scale) - (titleBarHeight * scale) - (widgetsHeight * scale) - (footerHeight * scale) - (padding * 2 * scale);
                const availableWidth = (node.size[0] * scale) - (padding * 2 * scale);
                
                if (availableWidth <= 0 || availableHeight <= 0) return null;
                
                let drawW = availableWidth;
                let drawH = availableHeight;
                let contentScale = 1;
                
                if (node.imageLoaded && node.image) {
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
                const drawY = nodeScreenY + (titleBarHeight * scale) + (widgetsHeight * scale) + (padding * scale) + ((availableHeight - drawH) / 2);
                
                return { left: drawX, top: drawY, width: drawW, height: drawH, scale: contentScale };
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
            
            const drawOverlay = () => {
                if (!_overlayCanvas || !_lastRect || !node.imageLoaded) return;
                const width = parseFloat(_overlayCanvas.style.width);
                const height = parseFloat(_overlayCanvas.style.height);
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
            
            const createOverlayCanvas = () => {
                if (_overlayCanvas) return;
                _overlayCanvas = document.createElement("canvas");
                _overlayCanvas.style.cssText = `
                    position: fixed !important;
                    z-index: 900 !important;
                    pointer-events: auto !important;
                    cursor: crosshair !important;
                    background: transparent !important;
                    border: 1px dashed #00FF00 !important;
                    display: none;
                `;
                document.body.appendChild(_overlayCanvas);
                
                _overlayCanvas.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    _overlayCanvas.style.border = "2px solid #4CAF50";
                    _overlayCanvas.style.backgroundColor = "rgba(76, 175, 80, 0.15)";
                });
                
                _overlayCanvas.addEventListener("dragleave", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    _overlayCanvas.style.border = "1px dashed #00FF00";
                    _overlayCanvas.style.backgroundColor = "transparent";
                });
                
                _overlayCanvas.addEventListener("drop", async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    _overlayCanvas.style.border = "1px dashed #00FF00";
                    _overlayCanvas.style.backgroundColor = "transparent";
                    
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                        console.log("[SPLINE 🦊] Overlay DnD file:", file.name);
                        await uploadFileAndLoad(file);
                    } else if (file) {
                        console.log("[SPLINE 🦊] Not an image file:", file.type);
                    }
                });
                
                _overlayCanvas.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    if (!node.imageLoaded) return;
                    
                    const rect = _overlayCanvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const scale = parseFloat(_overlayCanvas.dataset.scale || "1");
                    const imgX = x / scale;
                    const imgY = y / scale;
                    
                    if (e.button === 2 || e.ctrlKey) {
                        for (let i = _points.length - 1; i >= 0; i--) {
                            const dist = Math.hypot(_points[i].x - imgX, _points[i].y - imgY);
                            if (dist < 15 / scale) {
                                _points.splice(i, 1);
                                syncData();
                                break;
                            }
                        }
                    } else if (e.button === 0) {
                        if (_points.length >= 3) {
                            const distToFirst = Math.hypot(_points[0].x - imgX, _points[0].y - imgY);
                            if (distToFirst < 20 / scale) {
                                syncData();
                                return;
                            }
                        }
                        _points.push({ x: imgX, y: imgY });
                        syncData();
                    }
                });
                
                const updateLoop = () => {
                    if (!_overlayCanvas) return;
                    syncPosition();
                    _animationId = requestAnimationFrame(updateLoop);
                };
                updateLoop();
            };
            
            node.onDrawForeground = function(ctx) {
                if (this.flags.collapsed) return;
                
                const [w, h] = this.size;
                let widgetsHeight = 0;
                if (this.widgets) {
                    for (const w of this.widgets) {
                        if (!w.hidden) widgetsHeight += 20;
                    }
                }
                
                const titleBarHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
                const padding = 10;
                const footerHeight = 50;
                const btnH = 28;
                const btnY = h - 45;
                const btnW = (w - 50) / 3;
                
                const startY = titleBarHeight + widgetsHeight + padding;
                const availableHeight = h - startY - footerHeight - padding;
                const availableWidth = w - (padding * 2);
                
                if (this.imageLoaded && this.image) {
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
                    ctx.strokeRect(drawX, drawY, drawW, drawH);
                } else {
                    ctx.fillStyle = "#222";
                    ctx.fillRect(padding, startY, availableWidth, availableHeight);
                    ctx.fillStyle = "#555";
                    ctx.font = "14px Arial";
                    ctx.textAlign = "center";
                    ctx.fillText("Select Image...", w / 2, startY + availableHeight / 2);
                }
                
                for (let i = 0; i < this.buttons.length; i++) {
                    const btn = this.buttons[i];
                    btn.x = 15 + (i * (btnW + 5));
                    btn.y = btnY;
                    btn.w = btnW;
                    btn.h = btnH;
                    
                    ctx.fillStyle = btn.hover ? "#444" : "#2a2a2a";
                    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
                    ctx.strokeStyle = btn.color;
                    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
                    ctx.fillStyle = btn.color;
                    ctx.font = "bold 11px Arial";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
                }
            };
            
            node.onMouseMove = function(event, pos) {
                const [x, y] = pos;
                let changed = false;
                for (const btn of this.buttons) {
                    const isOver = x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
                    if (btn.hover !== isOver) {
                        btn.hover = isOver;
                        changed = true;
                    }
                }
                if (changed) this.setDirtyCanvas(true, false);
            };
            
            node.onMouseDown = function(event, pos) {
                const [x, y] = pos;
                for (const btn of this.buttons) {
                    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                        btn.callback();
                        return true;
                    }
                }
                return false;
            };
            
            node.onResize = function() {
                _lastRect = null;
                syncPosition();
            };
            
            node.onMove = function() {
                _lastRect = null;
                syncPosition();
            };
            
            const onConfigure = node.onConfigure;
            node.onConfigure = function(o) {
                if (onConfigure) onConfigure.apply(this, arguments);
                if (imageWidget && imageWidget.value) {
                    node.loadImage(imageWidget.value);
                }
                if (coordsWidget && coordsWidget.value) {
                    try {
                        _points = JSON.parse(coordsWidget.value);
                        if (!Array.isArray(_points)) _points = [];
                        syncData();
                    } catch (e) {}
                }
            };
            
            const originalOnRemoved = node.onRemoved;
            node.onRemoved = function() {
                if (_animationId) {
                    cancelAnimationFrame(_animationId);
                    _animationId = null;
                }
                if (_overlayCanvas) _overlayCanvas.remove();
                const menu = document.querySelector('.spline-image-menu');
                if (menu) menu.remove();
                
                app.canvas.canvas.removeEventListener('dragover', handleCanvasDragOver, { capture: true });
                app.canvas.canvas.removeEventListener('drop', handleCanvasDrop, { capture: true });
                
                if (originalOnRemoved) originalOnRemoved.apply(this, arguments);
            };
            
            createOverlayCanvas();
            if (node.data.selected_image) {
                node.loadImage(node.data.selected_image);
            }
            
            return result;
        };
    },
    
    setup() {}
});