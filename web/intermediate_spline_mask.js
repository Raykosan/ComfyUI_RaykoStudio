console.log("[InSPLINE 🦊] intermediate_spline_mask.js LOADED!");
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RaykoIntermediateSplineMask",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RaykoIntermediateSplineMask") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            try {
                onNodeCreated?.apply(this, arguments);
                const node = this;
                
                node.image = new Image();
                node.imageReady = false;
                node.currentStatus = "Waiting...";
                node.buttons = [];
                
                const coordsWidget = node.widgets?.find(w => w.name === "coordinates");
                if (coordsWidget) {
                    coordsWidget.hidden = true;
                    coordsWidget.serializeValue = () => {
                        return node.properties?.spline_coords || "[]";
                    };
                }
                
                node.addButton = (label, color, callback) => {
                    node.buttons.push({
                        label: label, color: color, callback: callback,
                        x: 0, y: 0, w: 0, h: 30, hover: false
                    });
                };
                
                node.addButton("✔️ ACCEPT", "#28a745", () => node.sendDecision("approve"));
                node.addButton("🔴 CLEAR POINTS", "#dc3545", () => node.sendDecision("reject"));
                node.addButton("❌ CANCEL", "#666666", () => node.sendDecision("cancel"));
                
                node.setSize([450, 600]);
                
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
                
                const updateCoords = () => {
                    const jsonStr = JSON.stringify(_points);
                    node.properties = node.properties || {};
                    node.properties.spline_coords = jsonStr;
                    if (coordsWidget) coordsWidget.value = jsonStr;
                    drawOverlay();
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
                        position: fixed !important; z-index: 1000 !important;
                        pointer-events: auto !important; cursor: crosshair !important;
                        background: transparent !important; touch-action: none;
                        border: 1px dashed #00FF00 !important; box-sizing: border-box !important;
                        display: none;
                    `;
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
                            ctx.fillText("Waiting for Image...", w / 2, startY + availableHeight / 2);
                        }
                        
                        const btnH = 28;
                        const btnY = h - 45;
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
                };
                
                node.sendDecision = async function(decision) {
                    const currentCoords = node.properties?.spline_coords || "[]";
                    this.currentStatus = `Sending ${decision}...`;
                    this.setDirtyCanvas(true, true);

                    if (decision === "cancel") {
                        try {
                            await api.interrupt();
                        } catch (e) { console.error("Interrupt failed:", e); }
                    }
                    
                    if (decision === "reject") {
                        _points = [];
                        updateCoords();
                    }

                    try {
                        const resp = await fetch("/rayko/inspline/decision", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ 
                                node_id: this.id.toString(), 
                                decision: decision,
                                coordinates: currentCoords
                            })
                        });

                        if (resp.ok) {
                            if (decision === "approve") {
                                this.currentStatus = "✅ Approved! Processing...";
                            } else if (decision === "reject") {
                                this.currentStatus = "🔄 Points cleared. Draw & Approve!";
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
                    console.log(`[InSPLINE 🦊] Node ${this.id} removed, sending cleanup signal...`);
                    
                    _syncRunning = false;
                    if (_overlayCanvas) { 
                        _overlayCanvas.remove(); 
                        _overlayCanvas = null; 
                    }
                    
                    fetch("/rayko/inspline/cleanup", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                            node_id: this.id.toString()
                        })
                    }).catch(err => {
                        console.error("[InSPLINE 🦊] Cleanup signal failed:", err);
                    });
                };
                
                createOverlayCanvas();
                
                const originalOnRendered = app.canvas.onRendered;
                app.canvas.onRendered = function() {
                    if (originalOnRendered) originalOnRendered.apply(this, arguments);
                    if (_overlayCanvas && node.imageReady) {
                        _lastRect = null;
                        syncPosition();
                    }
                };
                
            } catch (error) {
                console.error("[InSPLINE 🦊] Critical Error:", error);
            }
        };
    },

    setup() {
        api.addEventListener("rayko.inspline.show", (event) => {
            const { node_id, image_url } = event.detail;
            const node = app.graph.getNodeById(node_id);
            if (node) {
                node.image.src = image_url + "&t=" + Date.now();
                node.image.onload = () => {
                    node.imageReady = true;
                    const overlay = document.querySelector(`canvas[style*="z-index: 1000"]`);
                    if (overlay) {
                        overlay.style.display = "block";
                    }
                    setTimeout(() => {
                        _lastRect = null;
                        syncPosition();
                    }, 100);
                    node.setDirtyCanvas(true, true);
                };
                if (node.size[1] < 600) node.setSize([node.size[0], 600]);
                node.currentStatus = "🎨 Draw mask, then APPROVE!";
                app.canvas.centerOnNode(node);
                node.setDirtyCanvas(true, true);
            }
        });
    }
});