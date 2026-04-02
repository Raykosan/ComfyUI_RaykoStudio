import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RaykoStudio.CropImage",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RSCropImage") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            try {
                onNodeCreated?.apply(this, arguments);
                const node = this;
                
                node.image = new Image();
                node.imageReady = false;
                node.currentStatus = "Waiting for image...";
                node.buttons = [];
                node.imageWidth = 0;
                node.imageHeight = 0;
                node._cropRect = { x: 0, y: 0, width: 256, height: 256 };
                node._overlayCanvas = null;
                
                const cropDataWidget = node.widgets?.find(w => w.name === "crop_data");
                if (cropDataWidget) {
                    cropDataWidget.hidden = true;
                    cropDataWidget.serializeValue = () => {
                        return node.properties?.crop_rect || "{}";
                    };
                }
                
                node.addButton = (label, color, callback) => {
                    node.buttons.push({
                        label: label, color: color, callback: callback,
                        x: 0, y: 0, w: 0, h: 30, hover: false
                    });
                };
                
                node.addButton("✔️ ACCEPT", "#28a745", () => node.sendDecision("approve"));
                node.addButton("🔄 RESET", "#dc3545", () => node.sendDecision("reject"));
                node.addButton("❌ CANCEL", "#666666", () => node.sendDecision("cancel"));
                
                node.setSize([500, 650]);
                
                let _syncRunning = false;
                let _lastRect = null;
                let _lastScale = 1;
                let _isSelecting = false;
                let _isDragging = false;
                let _isResizing = false;
                let _resizeHandle = null;
                let _startX = 0;
                let _startY = 0;
                let _startRect = null;
                
                if (node.properties?.crop_rect && node.properties.crop_rect !== "{}") {
                    try {
                        const r = JSON.parse(node.properties.crop_rect);
                        if (r.x !== undefined) node._cropRect = r;
                    } catch (e) {}
                }
                
                const updateCropRect = () => {
                    const jsonStr = JSON.stringify(node._cropRect);
                    node.properties = node.properties || {};
                    node.properties.crop_rect = jsonStr;
                    if (cropDataWidget) cropDataWidget.value = jsonStr;
                    drawOverlay();
                    node.setDirtyCanvas(true, true);
                };
                
                const calculateImageRect = () => {
                    if (!app.canvas || !node.imageReady) return null;
                    
                    const ds = app.canvas.ds;
                    const scale = ds.scale;
                    const canvasEl = app.canvas.canvas;
                    const canvasRect = canvasEl.getBoundingClientRect();
                    
                    const graphX = node.pos[0];
                    const graphY = node.pos[1];
                    
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
                    const footerHeight = 60;
                    const outputSlotsHeight = 40;
                    
                    const startY = titleBarHeight + widgetsTotalHeight + padding + outputSlotsHeight;
                    const availableHeight = node.size[1] - startY - footerHeight - padding;
                    const availableWidth = node.size[0] - (padding * 2);
                    
                    if (availableWidth <= 0 || availableHeight <= 0) return null;

                    let drawW = availableWidth;
                    let drawH = availableHeight;
                    let contentScale = 1;
                    
                    if (node.imageWidth > 0 && node.imageHeight > 0) {
                        const imgRatio = node.imageWidth / node.imageHeight;
                        
                        if (availableWidth / availableHeight > imgRatio) {
                            drawH = availableHeight;
                            drawW = drawH * imgRatio;
                        } else {
                            drawW = availableWidth;
                            drawH = drawW / imgRatio;
                        }
                        
                        contentScale = drawW / node.imageWidth;
                    }
                    
                    const drawX = nodeScreenX + (padding * scale) + ((availableWidth - drawW) * scale / 2);
                    const drawY = nodeScreenY + (startY * scale) + ((availableHeight - drawH) * scale / 2);
                    
                    return {
                        left: drawX,
                        top: drawY,
                        width: drawW * scale,
                        height: drawH * scale,
                        scale: contentScale
                    };
                };
                
                const startSyncLoop = () => {
                    if (_syncRunning) return;
                    _syncRunning = true;
                    const syncLoop = () => {
                        if (!_syncRunning) return;
                        syncPosition();
                        if (node._overlayCanvas) requestAnimationFrame(syncLoop);
                        else _syncRunning = false;
                    };
                    requestAnimationFrame(syncLoop);
                };

                const syncPosition = () => {
                    if (!node._overlayCanvas) return;
                    const imgRect = calculateImageRect();
                    if (!imgRect) return;
                    
                    const currentScale = app.canvas.ds.scale;
                    const scaleChanged = Math.abs(_lastScale - currentScale) > 0.01;
                    
                    const hasChanged = !_lastRect || 
                        Math.abs(_lastRect.left - imgRect.left) > 0.5 ||
                        Math.abs(_lastRect.top - imgRect.top) > 0.5 ||
                        Math.abs(_lastRect.width - imgRect.width) > 0.5 ||
                        Math.abs(_lastRect.height - imgRect.height) > 0.5 ||
                        scaleChanged;
                    
                    if (hasChanged) {
                        _lastScale = currentScale;
                        _lastRect = { ...imgRect };
                        node._overlayCanvas.style.left = `${imgRect.left}px`;
                        node._overlayCanvas.style.top = `${imgRect.top}px`;
                        node._overlayCanvas.style.width = `${imgRect.width}px`;
                        node._overlayCanvas.style.height = `${imgRect.height}px`;
                        
                        const screenScale = imgRect.scale * currentScale;
                        node._overlayCanvas.dataset.screenScale = screenScale;
                        
                        node._overlayCanvas.style.display = "block";
                        drawOverlay();
                    }
                };
                
                const createOverlayCanvas = () => {
                    if (node._overlayCanvas) return;
                    node._overlayCanvas = document.createElement("canvas");
                    node._overlayCanvas.style.cssText = `
                        position: fixed !important; z-index: 1000 !important;
                        pointer-events: auto !important; cursor: crosshair !important;
                        background: transparent !important; touch-action: none;
                        border: 1px dashed #00FF00 !important; box-sizing: border-box !important;
                        display: none;
                    `;
                    document.body.appendChild(node._overlayCanvas);
                    
                    node._overlayCanvas.addEventListener("mousedown", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const rect = node._overlayCanvas.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        
                        const screenScale = parseFloat(node._overlayCanvas.dataset.screenScale || "1");
                        const imgX = x / screenScale;
                        const imgY = y / screenScale;
                        
                        const cropX = node._cropRect.x * screenScale;
                        const cropY = node._cropRect.y * screenScale;
                        const cropW = node._cropRect.width * screenScale;
                        const cropH = node._cropRect.height * screenScale;
                        const handleSize = 10;
                        
                        const handles = {
                            'tl': { x: cropX, y: cropY },
                            'tr': { x: cropX + cropW, y: cropY },
                            'bl': { x: cropX, y: cropY + cropH },
                            'br': { x: cropX + cropW, y: cropY + cropH }
                        };
                        
                        let clickedHandle = null;
                        for (const [handle, pos] of Object.entries(handles)) {
                            if (Math.abs(x - pos.x) < handleSize && Math.abs(y - pos.y) < handleSize) {
                                clickedHandle = handle;
                                break;
                            }
                        }
                        
                        if (clickedHandle) {
                            _isResizing = true;
                            _resizeHandle = clickedHandle;
                        } else if (x >= cropX && x <= cropX + cropW && y >= cropY && y <= cropY + cropH) {
                            _isDragging = true;
                        } else {
                            _isSelecting = true;
                            node._cropRect = { x: imgX, y: imgY, width: 0, height: 0 };
                        }
                        
                        _startX = x;
                        _startY = y;
                        _startRect = { ...node._cropRect };
                        
                        node._overlayCanvas.setPointerCapture(e.pointerId || 1);
                    });
                    
                    node._overlayCanvas.addEventListener("mousemove", (e) => {
                        if (!_isSelecting && !_isDragging && !_isResizing) return;
                        
                        const rect = node._overlayCanvas.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        
                        const screenScale = parseFloat(node._overlayCanvas.dataset.screenScale || "1");
                        
                        const deltaX = (x - _startX) / screenScale;
                        const deltaY = (y - _startY) / screenScale;
                        
                        if (_isSelecting) {
                            const x1 = _startRect.x;
                            const y1 = _startRect.y;
                            const x2 = x1 + deltaX;
                            const y2 = y1 + deltaY;
                            
                            node._cropRect.x = Math.max(0, Math.min(x1, x2));
                            node._cropRect.y = Math.max(0, Math.min(y1, y2));
                            node._cropRect.width = Math.max(64, Math.abs(x2 - x1));
                            node._cropRect.height = Math.max(64, Math.abs(y2 - y1));
                            
                        } else if (_isDragging) {
                            node._cropRect.x = Math.max(0, _startRect.x + deltaX);
                            node._cropRect.y = Math.max(0, _startRect.y + deltaY);
                            
                        } else if (_isResizing) {
                            const handle = _resizeHandle;
                            let newX = _startRect.x;
                            let newY = _startRect.y;
                            let newW = _startRect.width;
                            let newH = _startRect.height;
                            
                            if (handle === 'tl' || handle === 'bl') {
                                newW = _startRect.width - deltaX;
                                newX = _startRect.x + deltaX;
                                if (newW >= 64 && newX >= 0) {
                                    node._cropRect.width = newW;
                                    node._cropRect.x = newX;
                                }
                            }
                            if (handle === 'tr' || handle === 'br') {
                                newW = _startRect.width + deltaX;
                                if (newW >= 64) {
                                    node._cropRect.width = newW;
                                }
                            }
                            if (handle === 'tl' || handle === 'tr') {
                                newH = _startRect.height - deltaY;
                                newY = _startRect.y + deltaY;
                                if (newH >= 64 && newY >= 0) {
                                    node._cropRect.height = newH;
                                    node._cropRect.y = newY;
                                }
                            }
                            if (handle === 'bl' || handle === 'br') {
                                newH = _startRect.height + deltaY;
                                if (newH >= 64) {
                                    node._cropRect.height = newH;
                                }
                            }
                        }
                        
                        updateCropRect();
                    });
                    
                    node._overlayCanvas.addEventListener("mouseup", (e) => {
                        _isSelecting = false;
                        _isDragging = false;
                        _isResizing = false;
                        _resizeHandle = null;
                        node._overlayCanvas.releasePointerCapture(e.pointerId || 1);
                    });
                    
                    startSyncLoop();
                };
                
                const drawOverlay = () => {
                    if (!node._overlayCanvas) return;
                    const width = parseFloat(node._overlayCanvas.style.width || "0");
                    const height = parseFloat(node._overlayCanvas.style.height || "0");
                    if (width <= 0 || height <= 0) return;
                    
                    const dpr = window.devicePixelRatio || 1;
                    node._overlayCanvas.width = width * dpr;
                    node._overlayCanvas.height = height * dpr;
                    const ctx = node._overlayCanvas.getContext("2d");
                    ctx.scale(dpr, dpr);
                    ctx.clearRect(0, 0, width, height);
                    
                    const screenScale = parseFloat(node._overlayCanvas.dataset.screenScale || "1");
                    
                    const cropX = node._cropRect.x * screenScale;
                    const cropY = node._cropRect.y * screenScale;
                    const cropW = Math.max(1, node._cropRect.width * screenScale);
                    const cropH = Math.max(1, node._cropRect.height * screenScale);
                    
                    ctx.fillStyle = "rgba(0, 200, 100, 0.25)";
                    ctx.fillRect(cropX, cropY, cropW, cropH);
                    
                    ctx.strokeStyle = "#00c864";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(cropX, cropY, cropW, cropH);
                    
                    const handleSize = 8;
                    ctx.fillStyle = "#00c864";
                    ctx.fillRect(cropX - handleSize/2, cropY - handleSize/2, handleSize, handleSize);
                    ctx.fillRect(cropX + cropW - handleSize/2, cropY - handleSize/2, handleSize, handleSize);
                    ctx.fillRect(cropX - handleSize/2, cropY + cropH - handleSize/2, handleSize, handleSize);
                    ctx.fillRect(cropX + cropW - handleSize/2, cropY + cropH - handleSize/2, handleSize, handleSize);
                    
                    ctx.fillStyle = "#ffffff";
                    ctx.font = "bold 12px Arial";
                    ctx.fillText(`${Math.round(node._cropRect.width)} x ${Math.round(node._cropRect.height)}`, cropX + 5, cropY + 20);
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
                        const footerHeight = 60;
                        const outputSlotsHeight = 40;
                        
                        const startY = titleBarHeight + widgetsTotalHeight + padding + outputSlotsHeight;
                        const availableHeight = h - startY - footerHeight - padding;
                        const availableWidth = w - (padding * 2);
                        
                        if (this.imageReady && this.image) {
                            const imgRatio = this.imageWidth / this.imageHeight;
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
                            ctx.fillText("Waiting for Image...", w / 2, startY + availableHeight / 2);
                        }
                        
                        ctx.fillStyle = "#888";
                        ctx.font = "11px Arial";
                        ctx.textAlign = "center";
                        ctx.fillText(this.currentStatus, w / 2, h - 50);
                        
                        const btnH = 28;
                        const btnY = h - 40;
                        const btnW = (w - 50) / 3;

                        this.buttons[0].x = 15; this.buttons[0].y = btnY; this.buttons[0].w = btnW; this.buttons[0].h = btnH;
                        this.buttons[1].x = 20 + btnW; this.buttons[1].y = btnY; this.buttons[1].w = btnW; this.buttons[1].h = btnH;
                        this.buttons[2].x = 25 + (btnW * 2); this.buttons[2].y = btnY; this.buttons[2].w = btnW; this.buttons[2].h = btnH;

                        for (let btn of this.buttons) {
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
                };
                
                const onMove = node.onMove;
                node.onMove = function() {
                    if (onMove) onMove.apply(this, arguments);
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
                };
                
                node.sendDecision = async function(decision) {
                    const currentCropData = JSON.stringify(node._cropRect);
                    
                    node.properties = node.properties || {};
                    node.properties.crop_rect = currentCropData;
                    if (cropDataWidget) cropDataWidget.value = currentCropData;
                    
                    this.currentStatus = `Sending ${decision}...`;
                    this.setDirtyCanvas(true, true);

                    if (decision === "cancel") {
                        try {
                            await api.interrupt();
                        } catch (e) { console.error("Interrupt failed:", e); }
                    }
                    
                    if (decision === "reject") {
                        node._cropRect = { x: 0, y: 0, width: 256, height: 256 };
                        updateCropRect();
                    }

                    try {
                        const resp = await fetch("/rayko/rscrop/decision", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ 
                                node_id: this.id.toString(), 
                                decision: decision,
                                crop_data: currentCropData
                            })
                        });

                        if (resp.ok) {
                            if (decision === "approve") {
                                this.currentStatus = "✅ Approved! Processing...";
                            } else if (decision === "reject") {
                                this.currentStatus = "🔄 Reset. Select & Approve!";
                            } else {
                                this.currentStatus = "❌ Cancelled.";
                            }
                        } else {
                            this.currentStatus = "Error: " + resp.statusText;
                        }
                    } catch (err) {
                        this.currentStatus = "Error: Connection Failed";
                    }
                    this.setDirtyCanvas(true, true);
                };
                
                node.onRemoved = function() {
                    _syncRunning = false;
                    if (node._overlayCanvas) { 
                        node._overlayCanvas.remove(); 
                        node._overlayCanvas = null; 
                    }
                    
                    fetch("/rayko/rscrop/cleanup", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                            node_id: this.id.toString()
                        })
                    }).catch(err => {});
                };
                
                api.addEventListener("rayko.rscrop.show", (event) => {
                    const { node_id, image_url, image_width, image_height } = event.detail;
                    const currentId = node.id;
                    
                    if (String(node_id) === String(currentId)) {
                        node.image.src = image_url + "&t=" + Date.now();
                        node.image.onload = () => {
                            console.log("[RS Crop 🦊] Image loaded, showing overlay");
                            node.imageReady = true;
                            node.imageWidth = image_width || node.image.width;
                            node.imageHeight = image_height || node.image.height;
                            
                            if (node._overlayCanvas) {
                                node._overlayCanvas.style.display = "block";
                                console.log("[RS Crop 🦊] Overlay display set to block");
                            }
                            
                            if (node.properties?.crop_rect) {
                                try {
                                    const r = JSON.parse(node.properties.crop_rect);
                                    if (r.x >= node.imageWidth) r.x = 0;
                                    if (r.y >= node.imageHeight) r.y = 0;
                                    if (r.x + r.width > node.imageWidth) r.width = Math.max(64, node.imageWidth - r.x);
                                    if (r.y + r.height > node.imageHeight) r.height = Math.max(64, node.imageHeight - r.y);
                                    node.properties.crop_rect = JSON.stringify(r);
                                    node._cropRect = r;
                                } catch (e) {}
                            }
                            
                            setTimeout(() => {
                                _lastRect = null;
                                _lastScale = 1;
                                syncPosition();
                                node.setDirtyCanvas(true, true);
                            }, 100);
                        };
                        
                        if (node.size[1] < 650) node.setSize([node.size[0], 650]);
                        node.currentStatus = "🖱️ Drag to select crop area, then APPROVE!";
                        app.canvas.centerOnNode(node);
                        node.setDirtyCanvas(true, true);
                    }
                });
                
                createOverlayCanvas();
                
            } catch (error) {
                console.error("[RS Crop 🦊] Critical Error:", error);
            }
        };
    },
    
    setup() {
    }
});