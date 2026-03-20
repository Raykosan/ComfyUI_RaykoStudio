console.log("[SPLINE] spline_mask.js LOADED!");
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RaykoSplineMask",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RaykoSplineMask") return;
        
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            try {
                onNodeCreated?.apply(this, arguments);
                const node = this;
                
                console.log("[SPLINE] Node created:", node.id);
                
                const imageWidget = node.widgets?.find(w => w.name === "image");
                const coordsWidget = node.widgets?.find(w => w.name === "coordinates");
                
                if (coordsWidget) {
                    coordsWidget.hidden = true;
                    coordsWidget.serializeValue = () => {
                        return node.properties?.spline_coords || "[]";
                    };
                }
                
                const clearButton = node.addWidget("button", "❌ Clear Points", "clear", () => {
                    _points = [];
                    updateCoords();
                });
                
                setTimeout(() => {
                    if (node.widgets) {
                        const idx = node.widgets.indexOf(clearButton);
                        if (idx !== -1) {
                            node.widgets.splice(idx, 1);
                            node.widgets.unshift(clearButton);
                            node.setDirtyCanvas(true, true);
                        }
                    }
                }, 100);
                
                let _points = [];
                let _imagePreview = null;
                let _imageLoaded = false;
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
                    if (coordsWidget) {
                        coordsWidget.value = jsonStr;
                    }
                    drawOverlay();
                };
                
                const loadImage = async (filename) => {
                    const cleanFilename = filename.startsWith('._') ? filename.substring(2) : filename;
                    const url = `/api/view?filename=${encodeURIComponent(cleanFilename)}&type=input`;
                    
                    try {
                        const resp = await fetch(url);
                        if (resp.ok) {
                            const blob = await resp.blob();
                            const img = new Image();
                            img.src = URL.createObjectURL(blob);
                            
                            await new Promise((resolve, reject) => {
                                img.onload = () => {
                                    if (_imagePreview?.src) URL.revokeObjectURL(_imagePreview.src);
                                    _imagePreview = img;
                                    _imageLoaded = true;
                                    
                                    const targetHeight = Math.max(400, img.height / 3 + 150);
                                    node.setSize([Math.max(400, img.width / 3), targetHeight]);
                                    
                                    setTimeout(() => {
                                        if (!_overlayCanvas) createOverlayCanvas();
                                    }, 300);
                                    
                                    resolve();
                                };
                                img.onerror = reject;
                            });
                        }
                    } catch (e) {
                        console.error("[SPLINE] Load error:", e);
                        _imageLoaded = false;
                    }
                };
                
                // 🔥 РАСЧЁТ ВЫСОТЫ ЗАГОЛОВКА
                const getHeaderHeight = () => {
                    let lastWidgetBottom = 0;
                    
                    if (node.widgets) {
                        for (const w of node.widgets) {
                            if (w.hidden) continue;
                            
                            let widgetH = Math.max(w.height || 20, 28);
                            if (w.type === "combo" || w.name === "image") {
                                widgetH = Math.max(widgetH, 32);
                            }
                            
                            const widgetBottom = w.y + widgetH;
                            if (widgetBottom > lastWidgetBottom) {
                                lastWidgetBottom = widgetBottom;
                            }
                        }
                    }
                    
                    return lastWidgetBottom - 32;
                };
                
                // 🔥 РАСЧЁТ КООРДИНАТ ОВЕРЛЕЯ
                const calculateImageRect = () => {
                    if (!_imagePreview || !app.canvas) return null;
                    
                    const ds = app.canvas.ds;
                    const canvasEl = app.canvas.canvas;
                    const scale = ds.scale;
                    
                    const graphX = node.pos[0];
                    const graphY = node.pos[1];
                    
                    const canvasRect = canvasEl.getBoundingClientRect();
                    
                    // 🔥 ПРАВИЛЬНАЯ ФОРМУЛА: (graph + offset) * scale
                    const nodeScreenX = canvasRect.left + ((graphX + ds.offset[0]) * scale);
                    const nodeScreenY = canvasRect.top + ((graphY + ds.offset[1]) * scale);
                    
                    const headerHeightGraph = getHeaderHeight();
                    const scaledHeaderHeight = headerHeightGraph * scale;
                    
                    const nodePadding = 0 * scale;
                    
                    const nodeWidth = node.size[0] * scale;
                    const nodeHeight = node.size[1] * scale;
                    
                    const previewWidth = nodeWidth - (nodePadding * 2);
                    const previewHeight = nodeHeight - scaledHeaderHeight - (nodePadding * 2);
                    
                    const imgScale = Math.min(
                        previewWidth / _imagePreview.width,
                        previewHeight / _imagePreview.height
                    );
                    
                    const drawW = _imagePreview.width * imgScale;
                    const drawH = _imagePreview.height * imgScale;
                    
                    const drawX = nodeScreenX + nodePadding + (previewWidth - drawW) / 2;
                    const drawY = nodeScreenY + scaledHeaderHeight + nodePadding + (previewHeight - drawH) / 2;
                    
                    // 🔥 КОРРЕКЦИЯ РАЗМЕРОВ ОВЕРЛЕЯ
                    const overlayExpandX = 2 * scale;
                    const overlayExpandTop = 2 * scale;
                    const overlayShrinkBottom = 4 * scale;
                    
                    const correctedDrawX = drawX - overlayExpandX;
                    const correctedDrawY = drawY - overlayExpandTop;
                    const correctedDrawW = drawW + (overlayExpandX * 2);
                    const correctedDrawH = drawH + overlayExpandTop - overlayShrinkBottom;
                    
                    return {
                        left: correctedDrawX,
                        top: correctedDrawY,
                        width: correctedDrawW,
                        height: correctedDrawH,
                        scale: imgScale
                    };
                };
                
                // 🔥 НЕПРЕРЫВНЫЙ ЦИКЛ СИНХРОНИЗАЦИИ (60 FPS)
                const startSyncLoop = () => {
                    if (_syncRunning) return;
                    _syncRunning = true;
                    
                    const syncLoop = () => {
                        if (!_syncRunning) return;
                        
                        syncPosition();
                        
                        if (_overlayCanvas && _imageLoaded) {
                            requestAnimationFrame(syncLoop);
                        } else {
                            _syncRunning = false;
                        }
                    };
                    
                    requestAnimationFrame(syncLoop);
                    console.log("[SPLINE] Continuous sync loop started (60 FPS)");
                };

                const syncPosition = () => {
                    if (!_overlayCanvas || !_imageLoaded) return;
                    
                    const imgRect = calculateImageRect();
                    if (!imgRect) return;
                    
                    const hasChanged = !_lastRect || 
                        Math.abs(_lastRect.left - imgRect.left) > 0.1 ||
                        Math.abs(_lastRect.top - imgRect.top) > 0.1 ||
                        Math.abs(_lastRect.width - imgRect.width) > 0.1 ||
                        Math.abs(_lastRect.height - imgRect.height) > 0.1;
                    
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
                    // 🔥 ЧИСТЫЙ СТИЛЬ: прозрачный фон, зелёная рамка
                    _overlayCanvas.style.cssText = `
                        position: fixed !important;
                        z-index: 1000 !important;
                        pointer-events: auto !important;
                        cursor: crosshair !important;
                        background: transparent !important;
                        touch-action: none;
                        border: 3px solid #00FF00 !important;
                        box-sizing: border-box !important;
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
                
                // 🔥 ОТРИСОВКА ПРЕВЬЮ
                node.onDrawForeground = function(ctx) {
                    const headerHeightGraph = getHeaderHeight();
                    
                    const nodePadding = 0;
                    const canvasCorrectionX = 4;
                    const canvasCorrectionY = 12;
                    
                    const previewWidth = node.size[0] - (nodePadding * 2) - (canvasCorrectionX * 2);
                    const previewHeight = node.size[1] - headerHeightGraph - (nodePadding * 2) - canvasCorrectionY;
                    
                    if (_imageLoaded && _imagePreview) {
                        ctx.fillStyle = "#1a1a1a";
                        ctx.fillRect(nodePadding - 2 + canvasCorrectionX, headerHeightGraph - 2, 
                                    previewWidth + 4, previewHeight + 4);
                        
                        ctx.strokeStyle = "#444";
                        ctx.strokeRect(nodePadding - 2 + canvasCorrectionX, headerHeightGraph - 2, 
                                      previewWidth + 4, previewHeight + 4);
                        
                        const scale = Math.min(
                            previewWidth / _imagePreview.width,
                            previewHeight / _imagePreview.height
                        );
                        const drawW = _imagePreview.width * scale;
                        const drawH = _imagePreview.height * scale;
                        
                        const drawX = nodePadding + canvasCorrectionX + (previewWidth - drawW) / 2;
                        const drawY = headerHeightGraph + nodePadding + (previewHeight - drawH) / 2;
                        
                        ctx.drawImage(_imagePreview, drawX, drawY, drawW, drawH);
                        
                    } else {
                        ctx.fillStyle = "#222";
                        ctx.fillRect(nodePadding + canvasCorrectionX, headerHeightGraph, previewWidth, previewHeight);
                        ctx.fillStyle = "#666";
                        ctx.font = "14px Arial";
                        ctx.textAlign = "center";
                        ctx.fillText("Select image", 
                                    nodePadding + previewWidth / 2 + canvasCorrectionX,
                                    headerHeightGraph + previewHeight / 2);
                    }
                };
                
                const drawOverlay = () => {
                    if (!_overlayCanvas || !_imagePreview) return;
                    
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
                        const startX = _points[0].x * scale;
                        const startY = _points[0].y * scale;
                        ctx.moveTo(startX, startY);
                        
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
                
                if (imageWidget) {
                    const origCallback = imageWidget.callback;
                    imageWidget.callback = async function(value) {
                        _points = [];
                        updateCoords();
                        _imageLoaded = false;
                        _imagePreview = null;
                        
                        if (_overlayCanvas) {
                            _overlayCanvas.remove();
                            _overlayCanvas = null;
                            _lastRect = null;
                            _syncRunning = false;
                        }
                        
                        if (value && value !== "no_images_found") {
                            await loadImage(value);
                        }
                        
                        if (origCallback) origCallback.apply(this, arguments);
                    };
                    
                    if (imageWidget.value && imageWidget.value !== "no_images_found") {
                        setTimeout(() => loadImage(imageWidget.value), 100);
                    }
                }
                
                node.setSize([400, 500]);
                
                node.onRemoved = function() {
                    _syncRunning = false;
                    if (_overlayCanvas) {
                        _overlayCanvas.remove();
                        _overlayCanvas = null;
                    }
                    if (_imagePreview?.src) URL.revokeObjectURL(_imagePreview.src);
                };
                
            } catch (error) {
                console.error("[SPLINE] Critical Error:", error);
                console.trace(error);
            }
        };
    }
});