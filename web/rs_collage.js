import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

let activeRSCollageNode = null;

app.registerExtension({
    name: "RaykoStudio.RSCollage",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "RSCollage") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            this.overlay = { x: 0, y: 0, width: 100, height: 100, rotation: 0, flipH: false, flipV: false };
            this.overlayRelative = { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0, flipH: false, flipV: false };
            this.realOverlay = { width: 0, height: 0 };
            this.realBackground = { width: 0, height: 0 };

            this.displayWidth = 420;
            this.displayHeight = 420;
            this.canvasPixelSize = 420;
            this.viewScale = 1.0;
            this.viewOffsetX = 0;
            this.viewOffsetY = 0;

            this.overlayImage = null;
            this.backgroundImage = null;
            this.isEditing = false;
            this.isLoading = false;
            this.dragType = null;
            this.dragState = null;
            this.currentSessionTimestamp = null;

            this.opacity = 1.0;
            this.featherType = "None";
            this.blurRadius = 50;
            this.blurHardness = 0;
            this.advancedMode = false;

            this.overlayContainer = null;
            this.overlayCanvas = null;
            this.overlayCtx = null;
            this.overlayRenderLoop = null;
            this.overlayInputs = {};

            this.featherCenter = { x: 0.5, y: 0.5 };
            this.canvasRealWidth = 0;
            this.canvasRealHeight = 0;
            this.minWidth = 500;
            this.minHeight = 780;
            this.setSize([this.minWidth, this.minHeight]);

            this.btnApplyHover = false;
            this.btnFlipHHover = false;
            this.btnFlipVHover = false;
            this.btnCancelHover = false;

            this.featherPreviewCanvas = null;
            this.previewDirty = true;
            this.previewMaxSize = 512;
            this.pendingEditorData = null;

            this.heartbeatInterval = null;

            const syncWidgetValue = (widgetName, value) => {
                const widget = this.widgets?.find(w => w.name === widgetName);
                if (widget) {
                    widget.value = value;
                }
            };

            ["opacity", "feather_type", "blur_radius", "blur_hardness"].forEach(n => {
                const w = this.widgets?.find(w => w.name === n);
                if (w) w.hidden = true;
            });

            this.addWidget("slider", "opacity", 1.0, v => { this.opacity = v; syncWidgetValue("opacity", v); this.previewDirty = true; this.setDirtyCanvas(true); }, { min: 0, max: 1, step: 0.01 });
            this.addWidget("combo", "feather_type", "None", v => { this.featherType = v; syncWidgetValue("feather_type", v); this.previewDirty = true; this.setDirtyCanvas(true); }, { values: ["None", "Radial Blur In", "Radial Blur Out", "Ellipse Blur In", "Ellipse Blur Out"] });
            this.addWidget("slider", "blur_radius", 50, v => { this.blurRadius = v; syncWidgetValue("blur_radius", v); this.previewDirty = true; this.setDirtyCanvas(true); }, { min: 0, max: 100, step: 1 });
            this.addWidget("slider", "blur_hardness", 0, v => { this.blurHardness = v; syncWidgetValue("blur_hardness", v); this.previewDirty = true; this.setDirtyCanvas(true); }, { min: 0, max: 100, step: 1 });

            this.startHeartbeat = function() {
                if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = setInterval(async () => {
                    try {
                        await fetch("/rayko/rs_collage/heartbeat", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ node_id: String(this.id) })
                        });
                    } catch (e) {}
                }, 3000);
            };

            this.stopHeartbeat = function() {
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                    this.heartbeatInterval = null;
                }
            };

            if (!this.overlayContainer) {
                this.overlayContainer = document.createElement('div');
                this.overlayContainer.style.cssText = 'position:fixed;top:60px;left:0;right:0;bottom:0;background:rgba(10,10,10,0.96);z-index:999;display:none;flex-direction:row;align-items:stretch;font-family:system-ui,-apple-system,sans-serif;';

                this.overlayCanvasWrapper = document.createElement('div');
                this.overlayCanvasWrapper.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;';

                this.overlayCanvas = document.createElement('canvas');
                this.overlayCanvas.style.cssText = 'box-shadow:0 8px 32px rgba(0,0,0,0.7);cursor:crosshair;max-width:98%;max-height:98%;border-radius:8px;';
                this.overlayCanvasWrapper.appendChild(this.overlayCanvas);
                this.overlayCtx = this.overlayCanvas.getContext('2d');

                this.sidePanel = document.createElement('div');
                this.sidePanel.style.cssText = 'width:260px;background:#151515;border-left:1px solid #333;padding:16px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;overflow-y:auto;';

                const makeLabel = (txt) => {
                    const l = document.createElement('label');
                    l.textContent = txt;
                    l.style.cssText = 'color:#aaa;font-size:11px;font-weight:600;margin-bottom:-4px;display:block;';
                    return l;
                };
                const makeInput = (type, min, max, step, value) => {
                    const i = document.createElement('input');
                    i.type = type; i.min = min; i.max = max; i.step = step; i.value = value;
                    i.style.cssText = 'width:100%;background:#252525;color:#eee;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px;outline:none;';
                    return i;
                };
                const makeSelect = (opts, val) => {
                    const s = document.createElement('select');
                    opts.forEach(o => {
                        const op = document.createElement('option');
                        op.value = o; op.textContent = o;
                        if (o === val) op.selected = true;
                        s.appendChild(op);
                    });
                    s.style.cssText = 'width:100%;background:#252525;color:#eee;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px;outline:none;';
                    return s;
                };
                const makeBtn = (txt, col, onClick) => {
                    const b = document.createElement('button');
                    b.textContent = txt;
                    b.style.cssText = `width:100%;padding:10px;background:#222;color:${col};border:1px solid ${col};border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;margin-top:4px;transition:0.15s;`;
                    b.onmouseenter = () => { b.style.background = '#2a2a2a'; b.style.transform = 'translateY(-1px)'; };
                    b.onmouseleave = () => { b.style.background = '#222'; b.style.transform = 'none'; };
                    b.onclick = (e) => { e.stopPropagation(); onClick(); };
                    return b;
                };

                this.sidePanel.appendChild(makeLabel("OPACITY"));
                this.overlayInputs.opacity = makeInput("range", 0, 100, 1, 100); this.sidePanel.appendChild(this.overlayInputs.opacity);
                this.sidePanel.appendChild(makeLabel("FEATHER TYPE"));
                this.overlayInputs.featherType = makeSelect(["None", "Radial Blur In", "Radial Blur Out", "Ellipse Blur In", "Ellipse Blur Out"], "None"); this.sidePanel.appendChild(this.overlayInputs.featherType);
                this.sidePanel.appendChild(makeLabel("BLUR RADIUS"));
                this.overlayInputs.blurRadius = makeInput("range", 0, 100, 1, 50); this.sidePanel.appendChild(this.overlayInputs.blurRadius);
                this.sidePanel.appendChild(makeLabel("BLUR HARDNESS"));
                this.overlayInputs.blurHardness = makeInput("range", 0, 100, 1, 0); this.sidePanel.appendChild(this.overlayInputs.blurHardness);

                const sync = (key, type) => {
                    const el = this.overlayInputs[key];
                    const handler = () => {
                        if (key === 'opacity') {
                            this.opacity = parseFloat(el.value) / 100;
                            syncWidgetValue("opacity", this.opacity);
                        } else if (type === 'float') {
                            this[key] = parseFloat(el.value);
                        } else {
                            this[key] = parseInt(el.value);
                            if (key === 'blurRadius') syncWidgetValue("blur_radius", this[key]);
                            else if (key === 'blurHardness') syncWidgetValue("blur_hardness", this[key]);
                        }
                        this.previewDirty = true;
                        this.setDirtyCanvas(true);
                    };
                    el.addEventListener('input', handler);
                    el.addEventListener('change', handler);
                };
                sync('opacity', 'float');
                this.overlayInputs.featherType.addEventListener('change', () => {
                    this.featherType = this.overlayInputs.featherType.value;
                    syncWidgetValue("feather_type", this.featherType);
                    this.previewDirty = true;
                    this.setDirtyCanvas(true);
                });
                sync('blurRadius', 'int');
                sync('blurHardness', 'int');

                const div = () => { const d = document.createElement('div'); d.style.cssText = 'height:1px;background:#333;margin:8px 0;'; return d; };
                this.sidePanel.appendChild(div());
                this.sidePanel.appendChild(makeBtn("↔️ FLIP HORIZONTAL", "#2196F3", () => { this.overlay.flipH = !this.overlay.flipH; this.updateRelativeFromAbsolute(); this.previewDirty = true; this.setDirtyCanvas(true); }));
                this.sidePanel.appendChild(makeBtn("↕️ FLIP VERTICAL", "#2196F3", () => { this.overlay.flipV = !this.overlay.flipV; this.updateRelativeFromAbsolute(); this.previewDirty = true; this.setDirtyCanvas(true); }));
                this.sidePanel.appendChild(div());
                this.btnNormal = makeBtn("↩️ NORMAL MODE", "#607D8B", () => this._toggleAdvancedMode()); this.sidePanel.appendChild(this.btnNormal);
                this.btnApply = makeBtn("✔️ APPLY", "#4CAF50", () => { this.sendTransforms(); this._toggleAdvancedMode(); }); this.sidePanel.appendChild(this.btnApply);
                this.btnCancel = makeBtn("❌ CANCEL", "#dc3545", () => { this.cancelEditing(); this._toggleAdvancedMode(); }); this.sidePanel.appendChild(this.btnCancel);

                this.overlayContainer.appendChild(this.overlayCanvasWrapper);
                this.overlayContainer.appendChild(this.sidePanel);
                document.body.appendChild(this.overlayContainer);

                this._resizeObserver = new ResizeObserver(() => this._resizeOverlayCanvas());
                this._resizeObserver.observe(this.overlayCanvasWrapper);
            }

            api.addEventListener("rs-collage-start", (event) => { if (event.detail.id != this.id) return; this.pendingEditorData = event.detail; this.openDeferredEditor(); });
            api.addEventListener("rs-collage-ready", (event) => { if (event.detail.id != this.id) return; this.pendingEditorData = event.detail; });
            api.addEventListener("interrupted", () => {
                this.stopHeartbeat();
                this.pendingEditorData = null;
                this.isLoading = false;
                this.isEditing = false;
                this.dragType = null;
                this.dragState = null;
                this.setDirtyCanvas(true);
            });

            const origOnRemoved = this.onRemoved;
            this.onRemoved = function() {
                this.stopHeartbeat();
                try {
                    fetch("/rayko/rs_collage/cleanup", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ node_id: String(this.id) })
                    }).catch(() => {});
                } catch(e) {}
                if (origOnRemoved) origOnRemoved.call(this);
            };
        };

        nodeType.prototype._syncOverlayUI = function() {
            if (!this.advancedMode) return;
            this.overlayInputs.opacity.value = Math.round(this.opacity * 100);
            this.overlayInputs.featherType.value = this.featherType;
            this.overlayInputs.blurRadius.value = this.blurRadius;
            this.overlayInputs.blurHardness.value = this.blurHardness;
        };

        nodeType.prototype._resizeOverlayCanvas = function() {
            if (!this.overlayCanvasWrapper || !this.overlayCanvas) return;
            const w = this.overlayCanvasWrapper.clientWidth;
            const h = this.overlayCanvasWrapper.clientHeight;
            if (w > 0 && h > 0) {
                this.overlayCanvas.width = w;
                this.overlayCanvas.height = h;
                this.setDirtyCanvas(true);
                if (this.advancedMode && this.isEditing) {
                    this.computeAndApplyView();
                }
            }
        };

        nodeType.prototype._handleOverlayEvent = function(e, type) {
            e.preventDefault();
            e.stopPropagation();
            const rect = this.overlayCanvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const scaleX = this.overlayCanvas.width / rect.width;
            const scaleY = this.overlayCanvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            this.previewDirty = true;
            if (type === 'down') this.onMouseDown(null, [x, y]);
            else if (type === 'move') this.onMouseMove(null, [x, y]);
            else this.onMouseUp();
            this.setDirtyCanvas(true);
        };

        nodeType.prototype._handleOverlayWheel = function(e) {
            if (!this.advancedMode || !this.isEditing || activeRSCollageNode !== this) return;
            e.preventDefault();
            e.stopPropagation();

            const canvasRect = this.overlayCanvas.getBoundingClientRect();
            if (canvasRect.width === 0 || canvasRect.height === 0) return;

            const scaleX = this.overlayCanvas.width / canvasRect.width;
            const scaleY = this.overlayCanvas.height / canvasRect.height;
            const canvasX = (e.clientX - canvasRect.left) * scaleX;
            const canvasY = (e.clientY - canvasRect.top) * scaleY;

            const { rectX, rectY } = this.getCanvasMetrics();
            const worldX = (canvasX - rectX - this.viewOffsetX) / this.viewScale;
            const worldY = (canvasY - rectY - this.viewOffsetY) / this.viewScale;

            const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
            const oldScale = this.viewScale;
            this.viewScale = Math.max(0.05, Math.min(10.0, this.viewScale * zoomFactor));

            this.viewOffsetX = canvasX - rectX - (worldX * this.viewScale);
            this.viewOffsetY = canvasY - rectY - (worldY * this.viewScale);

            this.previewDirty = true;
            this.setDirtyCanvas(true);
        };

        nodeType.prototype._toggleAdvancedMode = function(forceClose = false) {
            if (forceClose || this.advancedMode) {
                this.advancedMode = false;
                if (activeRSCollageNode === this) activeRSCollageNode = null;
                this.overlayContainer.style.display = 'none';

                if (this._overlayWheelHandler) {
                    this.overlayCanvas.removeEventListener('wheel', this._overlayWheelHandler);
                    delete this._overlayWheelHandler;
                }
                if (this._overlayMouseHandler) {
                    this.overlayCanvas.removeEventListener('mousedown', this._overlayMouseHandler);
                    this.overlayCanvas.removeEventListener('mousemove', this._overlayMouseHandler);
                    this.overlayCanvas.removeEventListener('mouseup', this._overlayMouseHandler);
                    this.overlayCanvas.removeEventListener('mouseleave', this._overlayMouseLeaveHandler);
                    delete this._overlayMouseHandler;
                    delete this._overlayMouseLeaveHandler;
                }
                if (this._globalKeyHandler) window.removeEventListener('keydown', this._globalKeyHandler);
                if (this.overlayRenderLoop) cancelAnimationFrame(this.overlayRenderLoop);
                this.setDirtyCanvas(true);
                return;
            }

            if (activeRSCollageNode && activeRSCollageNode !== this) {
                activeRSCollageNode._toggleAdvancedMode(true);
            }

            this.advancedMode = true;
            activeRSCollageNode = this;
            this.overlayContainer.style.display = 'flex';
            this._syncOverlayUI();

            requestAnimationFrame(() => {
                this._resizeOverlayCanvas();
                this.computeAndApplyView();
            });

            this._overlayMouseHandler = (e) => this._handleOverlayEvent(e, e.type === 'mousedown' ? 'down' : e.type === 'mousemove' ? 'move' : 'up');
            this._overlayMouseLeaveHandler = () => this.onMouseUp();
            this.overlayCanvas.addEventListener('mousedown', this._overlayMouseHandler);
            this.overlayCanvas.addEventListener('mousemove', this._overlayMouseHandler);
            this.overlayCanvas.addEventListener('mouseup', this._overlayMouseHandler);
            this.overlayCanvas.addEventListener('mouseleave', this._overlayMouseLeaveHandler);

            this._overlayWheelHandler = (e) => this._handleOverlayWheel(e);
            this.overlayCanvas.addEventListener('wheel', this._overlayWheelHandler, { passive: false });

            this._globalKeyHandler = (e) => {
                if (e.key === 'Escape' && activeRSCollageNode === this) {
                    this.sendTransforms();
                    this._toggleAdvancedMode();
                }
            };
            window.addEventListener('keydown', this._globalKeyHandler);

            this.overlayRenderLoop = () => {
                if (!this.advancedMode || !this.overlayCtx) return;
                this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                this.drawOverlayCanvas(this.overlayCtx);
                requestAnimationFrame(this.overlayRenderLoop);
            };
            requestAnimationFrame(this.overlayRenderLoop);
        };

        nodeType.prototype.drawOverlayCanvas = function(ctx) {
            if (!this.isEditing || !this.backgroundImage) {
                ctx.fillStyle = "#888";
                ctx.font = "14px Arial";
                ctx.textAlign = "center";
                ctx.fillText("Loading...", this.overlayCanvas.width / 2, this.overlayCanvas.height / 2);
                return;
            }

            const { rectX, rectY } = this.getCanvasMetrics();
            const useScale = this.viewScale;
            const useOffsetX = this.viewOffsetX;
            const useOffsetY = this.viewOffsetY;

            ctx.save();
            ctx.translate(rectX + useOffsetX, rectY + useOffsetY);
            ctx.scale(useScale, useScale);

            ctx.drawImage(this.backgroundImage, -this.displayWidth / 2, -this.displayHeight / 2, this.displayWidth, this.displayHeight);

            if (this.overlayImage) {
                if (this.previewDirty) this.generateFeatherPreview();
                const prev = this.featherPreviewCanvas || this.overlayImage;

                ctx.save();
                ctx.translate(this.overlay.x, this.overlay.y);
                ctx.rotate(this.overlay.rotation * Math.PI / 180);
                ctx.scale(this.overlay.flipH ? -1 : 1, this.overlay.flipV ? -1 : 1);
                ctx.globalAlpha = this.opacity;
                ctx.drawImage(prev, -this.overlay.width / 2, -this.overlay.height / 2, this.overlay.width, this.overlay.height);
                ctx.globalAlpha = 1;

                ctx.shadowColor = "rgba(0,0,0,0.8)";
                ctx.shadowBlur = 4 / useScale;
                ctx.strokeStyle = "#00E5FF";
                ctx.lineWidth = 2 / useScale;
                ctx.strokeRect(-this.overlay.width / 2, -this.overlay.height / 2, this.overlay.width, this.overlay.height);
                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;

                const hw = this.overlay.width / 2, hh = this.overlay.height / 2;
                const hs = 6 / useScale;
                ctx.fillStyle = "#FF0000";
                [[hw, hh], [-hw, hh], [hw, -hh], [-hw, -hh]].forEach(([x, y]) => ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs));
                [[hw, 0], [-hw, 0], [0, hh], [0, -hh]].forEach(([x, y]) => ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs));

                const rotHandleY = -hh - 40;
                ctx.beginPath();
                ctx.arc(0, rotHandleY, 5 / useScale, 0, Math.PI * 2);
                ctx.fillStyle = "#ff9800";
                ctx.fill();
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1 / useScale;
                ctx.stroke();

                if (this.featherType.includes("Blur") && this.blurRadius > 0) {
                    const fCx = (this.featherCenter.x - 0.5) * this.overlay.width;
                    const fCy = (this.featherCenter.y - 0.5) * this.overlay.height;
                    ctx.strokeStyle = "#FF0000";
                    ctx.lineWidth = 2 / useScale;
                    ctx.beginPath();
                    ctx.moveTo(fCx - 12, fCy);
                    ctx.lineTo(fCx + 12, fCy);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(fCx, fCy - 12);
                    ctx.lineTo(fCx, fCy + 12);
                    ctx.stroke();
                    ctx.fillStyle = "#2196F3";
                    ctx.beginPath();
                    ctx.arc(fCx, fCy, 4 / useScale, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "#FFFFFF";
                    ctx.lineWidth = 1 / useScale;
                    ctx.stroke();
                }
                ctx.restore();
            }
            ctx.restore();

            ctx.fillStyle = "#ff9800";
            ctx.font = "12px Arial";
            ctx.textAlign = "left";
            ctx.fillText(`EDITING (Scale: ${(useScale * 100).toFixed(0)}%)`, this.overlayCanvas.width - 200, this.overlayCanvas.height - 20);
        };

        nodeType.prototype.openDeferredEditor = function() {
            if (!this.pendingEditorData) return;
            const data = this.pendingEditorData;
            this.overlayImage = null;
            this.backgroundImage = null;
            this.isLoading = true;
            this.currentSessionTimestamp = data.timestamp;
            this.opacity = data.opacity !== undefined ? data.opacity : 1.0;
            this.featherType = data.feather_type || "None";
            this.blurRadius = data.blur_radius !== undefined ? data.blur_radius : 50;
            this.blurHardness = data.blur_hardness !== undefined ? data.blur_hardness : 0;
            this.featherCenter = { x: 0.5, y: 0.5 };
            this.previewDirty = true;

            const syncWidgetValue = (widgetName, value) => {
                const widget = this.widgets?.find(w => w.name === widgetName);
                if (widget) {
                    widget.value = value;
                }
            };
            syncWidgetValue("opacity", this.opacity);
            syncWidgetValue("feather_type", this.featherType);
            syncWidgetValue("blur_radius", this.blurRadius);
            syncWidgetValue("blur_hardness", this.blurHardness);

            this.realBackground = { width: data.bg_width, height: data.bg_height };
            this.realOverlay = { width: data.ov_width, height: data.ov_height };
            this.canvasRealWidth = this.realBackground.width;
            this.canvasRealHeight = this.realBackground.height;
            this.updateDisplaySize(this.canvasPixelSize);

            const bgFile = data.bg_file, ovFile = data.ov_file, ts = data.timestamp;
            let loaded = 0;
            const onLoad = () => {
                loaded++;
                if (loaded === 2) {
                    requestAnimationFrame(() => {
                        this.isLoading = false;
                        const tS = this.canvasPixelSize * 0.5;
                        const sM = Math.min(this.realOverlay.width, this.realOverlay.height);
                        let sc = tS / sM, nw = this.realOverlay.width * sc, nh = this.realOverlay.height * sc;
                        if (nw > this.canvasPixelSize) { nw = this.canvasPixelSize; nh = nw / (this.realOverlay.width / this.realOverlay.height); }
                        if (nh > this.canvasPixelSize) { nh = this.canvasPixelSize; nw = nh * (this.realOverlay.width / this.realOverlay.height); }
                        this.overlayRelative = { width: nw / this.displayWidth, height: nh / this.displayHeight, x: 0.5, y: 0.5, rotation: 0, flipH: false, flipV: false };
                        this.updateOverlayAbsolute();
                        this.computeAndApplyView();
                        this.isEditing = true;
                        this.setDirtyCanvas(true);
                        this.startHeartbeat();
                    });
                }
            };
            const loadImg = (file, type) => {
                if (!file) { onLoad(); return; }
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.onload = () => { this[type] = img; onLoad(); };
                img.onerror = () => { onLoad(); };
                img.src = `/view?filename=${file}&type=temp&t=${ts}`;
            };
            loadImg(bgFile, "backgroundImage");
            loadImg(ovFile, "overlayImage");
        };

        nodeType.prototype.updateOverlayAbsolute = function() {
            this.overlay.x = (this.overlayRelative.x - 0.5) * this.displayWidth;
            this.overlay.y = (this.overlayRelative.y - 0.5) * this.displayHeight;
            this.overlay.width = this.overlayRelative.width * this.displayWidth;
            this.overlay.height = this.overlayRelative.height * this.displayHeight;
            this.overlay.rotation = this.overlayRelative.rotation;
            this.overlay.flipH = this.overlayRelative.flipH;
            this.overlay.flipV = this.overlayRelative.flipV;
        };

        nodeType.prototype.updateRelativeFromAbsolute = function() {
            this.overlayRelative.x = (this.overlay.x / this.displayWidth) + 0.5;
            this.overlayRelative.y = (this.overlay.y / this.displayHeight) + 0.5;
            this.overlayRelative.width = this.overlay.width / this.displayWidth;
            this.overlayRelative.height = this.overlay.height / this.displayHeight;
            this.overlayRelative.rotation = this.overlay.rotation;
            this.overlayRelative.flipH = this.overlay.flipH;
            this.overlayRelative.flipV = this.overlay.flipV;
        };

        nodeType.prototype.computeAndApplyView = function() {
            const bgW = this.displayWidth, bgH = this.displayHeight;
            const ovL = this.overlay.x - this.overlay.width / 2, ovT = this.overlay.y - this.overlay.height / 2;
            const ovR = this.overlay.x + this.overlay.width / 2, ovB = this.overlay.y + this.overlay.height / 2;
            const bgL = -bgW / 2, bgT = -bgH / 2, bgR = bgW / 2, bgB = bgH / 2;
            const minX = Math.min(ovL, bgL), minY = Math.min(ovT, bgT), maxX = Math.max(ovR, bgR), maxY = Math.max(ovB, bgB);
            const contentW = Math.max(1, maxX - minX), contentH = Math.max(1, maxY - minY);
            const contentCX = (minX + maxX) / 2, contentCY = (minY + maxY) / 2;

            if (this.advancedMode) {
                const cw = this.overlayCanvas.width || (this.overlayCanvasWrapper ? this.overlayCanvasWrapper.clientWidth : 1000);
                const ch = this.overlayCanvas.height || (this.overlayCanvasWrapper ? this.overlayCanvasWrapper.clientHeight : 800);
                const availableW = cw * 0.8, availableH = ch * 0.8;
                this.viewScale = Math.max(0.1, Math.min(3.0, Math.min(availableW / contentW, availableH / contentH)));
                this.viewOffsetX = cw / 2 - (contentCX * this.viewScale);
                this.viewOffsetY = ch / 2 - (contentCY * this.viewScale);
            } else {
                const availableW = this.canvasPixelSize * 0.95, availableH = this.canvasPixelSize * 0.95;
                this.viewScale = Math.max(0.1, Math.min(3.0, Math.min(availableW / contentW, availableH / contentH)));
                this.viewOffsetX = this.canvasPixelSize / 2 - (contentCX * this.viewScale);
                this.viewOffsetY = this.canvasPixelSize / 2 - (contentCY * this.viewScale);
            }
        };

        nodeType.prototype.updateDisplaySize = function(cS) {
            this.canvasPixelSize = cS;
            const safeHeight = this.realBackground.height || 1;
            const bgAR = this.realBackground.width / safeHeight;
            if (bgAR >= 1) { this.displayWidth = cS; this.displayHeight = cS / bgAR; }
            else { this.displayHeight = cS; this.displayWidth = cS * bgAR; }
        };

        nodeType.prototype.generateFeatherPreview = function() {
            if (!this.overlayImage || this.featherType === "None") { this.featherPreviewCanvas = null; this.previewDirty = false; return; }
            const rVal = this.blurRadius;
            if (rVal <= 0) { this.featherPreviewCanvas = null; this.previewDirty = false; return; }
            const mW = Math.min(this.realOverlay.width, this.previewMaxSize), mH = Math.min(this.realOverlay.height, this.previewMaxSize);
            const sc = Math.min(1, Math.min(mW / this.realOverlay.width, mH / this.realOverlay.height));
            const w = Math.round(this.realOverlay.width * sc), h = Math.round(this.realOverlay.height * sc);
            if (!this.featherPreviewCanvas || this.featherPreviewCanvas.width !== w || this.featherPreviewCanvas.height !== h) {
                this.featherPreviewCanvas = document.createElement('canvas');
                this.featherPreviewCanvas.width = w; this.featherPreviewCanvas.height = h;
            }
            const ctx = this.featherPreviewCanvas.getContext('2d');
            ctx.clearRect(0, 0, w, h); ctx.drawImage(this.overlayImage, 0, 0, w, h);
            const imgD = ctx.getImageData(0, 0, w, h), d = imgD.data;
            const cx = this.featherCenter.x * w, cy = this.featherCenter.y * h;
            const isRadial = this.featherType.includes("Radial Blur");
            const isEllipse = this.featherType.includes("Ellipse Blur");
            const ratio = rVal / 100.0; const hardness = this.blurHardness / 100.0;
            const overshoot = 1.15 + (1.0 - hardness) * 0.15; const exp = 1.0 + hardness * 30.0; const isOut = this.featherType.includes("Out");
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4; if (d[i + 3] === 0) continue; let dist;
                    if (isRadial) { const maxDist = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) || 1; const fw = Math.max(ratio * maxDist * overshoot, 1e-6); dist = Math.hypot(x - cx, y - cy) / fw; }
                    else if (isEllipse) { const dX = Math.max(cx, w - cx) || 1, dY = Math.max(cy, h - cy) || 1; const dx = Math.abs(x - cx) / dX, dy = Math.abs(y - cy) / dY; const E = Math.hypot(dx, dy); const fw = Math.max(ratio * overshoot, 1e-6); dist = E / fw; }
                    const norm = Math.min(1, Math.max(0, dist)); let mask = 1.0 - Math.pow(norm, exp);
                    if (hardness >= 0.5) mask = mask < 0.02 ? 0 : (mask > 0.98 ? 1 : mask);
                    if (isOut) mask = 1.0 - mask; d[i + 3] *= mask;
                }
            }
            ctx.putImageData(imgD, 0, 0); this.previewDirty = false;
        };

        nodeType.prototype.getRealTransform = function() {
            const dS = this.canvasRealWidth / (this.displayWidth || 1);
            const absX = (this.overlay.x * dS) + (this.canvasRealWidth / 2), absY = (this.overlay.y * dS) + (this.canvasRealHeight / 2);
            return { x: absX, y: absY, scale_x: (this.overlay.width * dS) / (this.realOverlay.width || 1), scale_y: (this.overlay.height * dS) / (this.realOverlay.height || 1), rotation: this.overlay.rotation, flip_h: this.overlay.flipH, flip_v: this.overlay.flipV };
        };

        nodeType.prototype.computeScreenHandles = function(rectX, rectY, useScale, useOffsetX, useOffsetY) {
            const hw = this.overlay.width / 2, hh = this.overlay.height / 2, rot = this.overlay.rotation * Math.PI / 180;
            const cos = Math.cos(rot), sin = Math.sin(rot), fx = this.overlay.flipH ? -1 : 1, fy = this.overlay.flipV ? -1 : 1;
            const handles = {
                'scale-tl': [-hw, -hh],
                'scale-tr': [hw, -hh],
                'scale-bl': [-hw, hh],
                'scale-br': [hw, hh],
                'scale-t': [0, -hh],
                'scale-b': [0, hh],
                'scale-l': [-hw, 0],
                'scale-r': [hw, 0],
                'rotate': [0, -hh - 40]
            };
            const screenHandles = {};
            for (const [name, loc] of Object.entries(handles)) {
                const rx = loc[0] * cos - loc[1] * sin, ry = loc[0] * sin + loc[1] * cos;
                screenHandles[name] = { x: rectX + useOffsetX + (this.overlay.x + rx * fx) * useScale, y: rectY + useOffsetY + (this.overlay.y + ry * fy) * useScale };
            }

            const fCxLocal = (this.featherCenter.x - 0.5) * this.overlay.width;
            const fCyLocal = (this.featherCenter.y - 0.5) * this.overlay.height;
            const fRx = fCxLocal * cos - fCyLocal * sin;
            const fRy = fCxLocal * sin + fCyLocal * cos;
            screenHandles['feather-center'] = { x: rectX + useOffsetX + (this.overlay.x + fRx * fx) * useScale, y: rectY + useOffsetY + (this.overlay.y + fRy * fy) * useScale };

            return screenHandles;
        };

        nodeType.prototype.sendTransforms = async function() {
            const fcx = this.overlay.flipH ? 1.0 - this.featherCenter.x : this.featherCenter.x;
            const fcy = this.overlay.flipV ? 1.0 - this.featherCenter.y : this.featherCenter.y;

            const payload = {
                id: String(this.id),
                transforms: this.getRealTransform(),
                opacity: this.opacity,
                feather_type: this.featherType,
                blur_radius: this.blurRadius,
                blur_hardness: this.blurHardness,
                feather_center_x: fcx,
                feather_center_y: fcy
            };
            try {
                await api.fetchApi("/rayko/rs_collage", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                this.stopHeartbeat();
                this.isEditing = false;
                this.setDirtyCanvas(true);
            } catch(e) {}
        };

        nodeType.prototype.cancelEditing = async function() {
            this.stopHeartbeat();
            try { await api.interrupt(); } catch(e) {}
            await fetch("/rayko/rs_collage/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: String(this.id) }) });
            this.isEditing = false; this.isLoading = false; this.dragType = null; this.dragState = null; this.setDirtyCanvas(true);
        };

        nodeType.prototype.onResize = function(size) {
            if (size[0] < this.minWidth) size[0] = this.minWidth;
            if (size[1] < this.minHeight) size[1] = this.minHeight;
            this.setDirtyCanvas(true);
        };

        nodeType.prototype.getCanvasMetrics = function() {
            const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
            const canvasTopPadding = 175;
            const btnAreaH = 90;
            let cSize, rectX, rectY;
            if (this.advancedMode) {
                const w = this.overlayCanvas.width || (this.overlayCanvasWrapper ? this.overlayCanvasWrapper.clientWidth : 1000);
                const h = this.overlayCanvas.height || (this.overlayCanvasWrapper ? this.overlayCanvasWrapper.clientHeight : 800);
                cSize = Math.min(w, h);
                rectX = 0; rectY = 0;
            } else {
                const maxCanvasH = this.size[1] - titleH - canvasTopPadding - btnAreaH;
                cSize = Math.max(300, Math.min(this.size[0] - 40, maxCanvasH));
                rectX = (this.size[0] - cSize) / 2; rectY = titleH + canvasTopPadding;
            }
            return { cSize, rectX, rectY };
        };

        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this.advancedMode) {
                ctx.clearRect(0, 0, this.size[0], this.size[1]);
                return;
            }

            const { cSize, rectX, rectY } = this.getCanvasMetrics();
            ctx.fillStyle = "#1e1e1e"; ctx.fillRect(rectX, rectY, cSize, cSize);
            ctx.strokeStyle = "#555"; ctx.strokeRect(rectX, rectY, cSize, cSize);
            this.updateDisplaySize(cSize);

            if (!this.dragState) { this.updateOverlayAbsolute(); this.computeAndApplyView(); }

            if (this.isLoading) {
                ctx.fillStyle = "#888"; ctx.font = "12px Arial"; ctx.fillText("Loading...", rectX + cSize / 2 - 35, rectY + cSize / 2);
            } else if (this.isEditing && this.backgroundImage) {
                const useScale = this.dragState ? this.dragState.viewScale : this.viewScale;
                const useOffsetX = this.dragState ? this.dragState.viewOffsetX : this.viewOffsetX;
                const useOffsetY = this.dragState ? this.dragState.viewOffsetY : this.viewOffsetY;
                ctx.save(); ctx.translate(rectX + useOffsetX, rectY + useOffsetY); ctx.scale(useScale, useScale);
                ctx.drawImage(this.backgroundImage, -this.displayWidth / 2, -this.displayHeight / 2, this.displayWidth, this.displayHeight);
                if (this.overlayImage) {
                    if (this.previewDirty) this.generateFeatherPreview();
                    const prev = this.featherPreviewCanvas || this.overlayImage;
                    ctx.save(); ctx.translate(this.overlay.x, this.overlay.y); ctx.rotate(this.overlay.rotation * Math.PI / 180);
                    ctx.scale(this.overlay.flipH ? -1 : 1, this.overlay.flipV ? -1 : 1); ctx.globalAlpha = this.opacity;
                    ctx.drawImage(prev, -this.overlay.width / 2, -this.overlay.height / 2, this.overlay.width, this.overlay.height); ctx.globalAlpha = 1;
                    ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4 / useScale; ctx.strokeStyle = "#00E5FF"; ctx.lineWidth = 2 / useScale;
                    ctx.strokeRect(-this.overlay.width / 2, -this.overlay.height / 2, this.overlay.width, this.overlay.height); ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
                    const hw = this.overlay.width / 2, hh = this.overlay.height / 2, hs = 6 / useScale; ctx.fillStyle = "#FF0000";
                    [[hw, hh], [-hw, hh], [hw, -hh], [-hw, -hh]].forEach(([x, y]) => ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs));
                    [[hw, 0], [-hw, 0], [0, hh], [0, -hh]].forEach(([x, y]) => ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs));
                    const rotHandleY = -hh - 40; ctx.beginPath(); ctx.arc(0, rotHandleY, 5 / useScale, 0, Math.PI * 2); ctx.fillStyle = "#ff9800"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1 / useScale; ctx.stroke();
                    if (this.featherType.includes("Blur") && this.blurRadius > 0) {
                        const fCx = (this.featherCenter.x - 0.5) * this.overlay.width, fCy = (this.featherCenter.y - 0.5) * this.overlay.height;
                        ctx.strokeStyle = "#FF0000"; ctx.lineWidth = 2 / useScale; ctx.beginPath(); ctx.moveTo(fCx - 12, fCy); ctx.lineTo(fCx + 12, fCy); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(fCx, fCy - 12); ctx.lineTo(fCx, fCy + 12); ctx.stroke();
                        ctx.fillStyle = "#2196F3"; ctx.beginPath(); ctx.arc(fCx, fCy, 4 / useScale, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1 / useScale; ctx.stroke();
                    }
                    ctx.restore();
                }
                ctx.restore();
                ctx.fillStyle = "#ff9800"; ctx.font = "12px Arial"; ctx.fillText(`EDITING (Scale: ${(useScale * 100).toFixed(0)}%)`, rectX + cSize - 160, rectY + cSize - 10);
            } else {
                ctx.fillStyle = "#888"; ctx.font = "12px Arial"; ctx.fillText("▶ Run queue to start", rectX + cSize / 2 - 65, rectY + cSize / 2);
            }

            const toggleBtnW = 150, toggleBtnH = 24, toggleBtnX = (this.size[0] - toggleBtnW) / 2, toggleBtnY = 20;
            ctx.fillStyle = "#2a2a2a"; ctx.strokeStyle = "#2196F3"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(toggleBtnX + 6, toggleBtnY); ctx.lineTo(toggleBtnX + toggleBtnW - 6, toggleBtnY);
            ctx.quadraticCurveTo(toggleBtnX + toggleBtnW, toggleBtnY, toggleBtnX + toggleBtnW, toggleBtnY + 6); ctx.lineTo(toggleBtnX + toggleBtnW, toggleBtnY + toggleBtnH - 6);
            ctx.quadraticCurveTo(toggleBtnX + toggleBtnW, toggleBtnY + toggleBtnH, toggleBtnX + toggleBtnW - 6, toggleBtnY + toggleBtnH); ctx.lineTo(toggleBtnX + 6, toggleBtnY + toggleBtnH);
            ctx.quadraticCurveTo(toggleBtnX, toggleBtnY + toggleBtnH, toggleBtnX, toggleBtnY + toggleBtnH - 6); ctx.lineTo(toggleBtnX, toggleBtnY + 6);
            ctx.quadraticCurveTo(toggleBtnX, toggleBtnY, toggleBtnX + 6, toggleBtnY); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#2196F3"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("🔍 ADVANCED MODE", toggleBtnX + toggleBtnW / 2, toggleBtnY + toggleBtnH / 2 + 4);

            const btnW = (this.size[0] - 50) / 2, btnH = 30, gap = 10, y2 = this.size[1] - btnH - 15, y1 = y2 - btnH - gap;
            const rR = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); };
            [[15, y1, "↔️ FLIP H", this.btnFlipHHover, "#2196F3"], [15 + btnW + gap, y1, "️ FLIP V", this.btnFlipVHover, "#2196F3"], [15, y2, "✔️ APPLY", this.btnApplyHover, "#4CAF50"], [15 + btnW + gap, y2, "❌ CANCEL", this.btnCancelHover, "#dc3545"]].forEach(([bx, by, txt, hov, col]) => {
                ctx.fillStyle = hov ? "#444" : "#2a2a2a"; rR(ctx, bx, by, btnW, btnH, 6); ctx.fill(); ctx.strokeStyle = col; ctx.stroke(); ctx.fillStyle = col; ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText(txt, bx + btnW / 2, by + btnH / 2 + 4);
            });
        };

        nodeType.prototype.onMouseDown = function(event, pos) {
            if (!this.advancedMode && pos) {
                const toggleBtnW = 150, toggleBtnH = 24, toggleBtnX = (this.size[0] - toggleBtnW) / 2, toggleBtnY = 20;
                if (pos[0] >= toggleBtnX && pos[0] <= toggleBtnX + toggleBtnW && pos[1] >= toggleBtnY && pos[1] <= toggleBtnY + toggleBtnH) { this._toggleAdvancedMode(); return true; }
            }
            if (!this.isEditing || this.isLoading || !this.overlayImage) return;
            const { cSize, rectX, rectY } = this.getCanvasMetrics();
            const mx = pos[0], my = pos[1];
            const frozenScale = this.viewScale, frozenOffsetX = this.viewOffsetX, frozenOffsetY = this.viewOffsetY;
            const worldMx = (mx - rectX - frozenOffsetX) / frozenScale, worldMy = (my - rectY - frozenOffsetY) / frozenScale;
            const screenHandles = this.computeScreenHandles(rectX, rectY, frozenScale, frozenOffsetX, frozenOffsetY);
            const cornerSize = 14, edgeSize = 18, rotateSize = 22, featherSize = 18;
            let detectedType = null, minDist = Infinity;
            const checkHandle = (name, h, threshold) => { const dist = Math.hypot(mx - h.x, my - h.y); if (dist < threshold && dist < minDist) { detectedType = name; minDist = dist; } };
            for (const [name, hPos] of Object.entries(screenHandles)) {
                const isEdge = ['scale-t', 'scale-b', 'scale-l', 'scale-r'].includes(name);
                const threshold = name === 'rotate' ? rotateSize : (name === 'feather-center' ? featherSize : (isEdge ? edgeSize : cornerSize));
                checkHandle(name, hPos, threshold);
            }
            this.dragType = detectedType;
            if (this.dragType) {
                this.dragState = { startMouseX: worldMx, startMouseY: worldMy, startX: this.overlay.x, startY: this.overlay.y, startW: this.overlay.width, startH: this.overlay.height, startRotation: this.overlay.rotation, aspect: this.overlay.width / this.overlay.height, featherStartX: this.featherCenter.x, featherStartY: this.featherCenter.y, viewScale: frozenScale, viewOffsetX: frozenOffsetX, viewOffsetY: frozenOffsetY, startDist: ['scale-tl', 'scale-tr', 'scale-bl', 'scale-br'].includes(detectedType) ? Math.hypot(worldMx - this.overlay.x, worldMy - this.overlay.y) : 0 };
                return true;
            }
            const dx = worldMx - this.overlay.x, dy = worldMy - this.overlay.y;
            const rotRad = -this.overlay.rotation * Math.PI / 180;
            const localX = dx * Math.cos(rotRad) - dy * Math.sin(rotRad), localY = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
            const flipX = this.overlay.flipH ? -1 : 1, flipY = this.overlay.flipV ? -1 : 1;
            if (Math.abs(localX * flipX) < this.overlay.width / 2 && Math.abs(localY * flipY) < this.overlay.height / 2) {
                this.dragType = 'move';
                this.dragState = { startMouseX: worldMx, startMouseY: worldMy, startX: this.overlay.x, startY: this.overlay.y, startW: this.overlay.width, startH: this.overlay.height, startRotation: this.overlay.rotation, viewScale: frozenScale, viewOffsetX: frozenOffsetX, viewOffsetY: frozenOffsetY };
                return true;
            }
            if (!this.advancedMode && pos) {
                const btnW = (this.size[0] - 50) / 2, btnH = 30, gap = 10, y2 = this.size[1] - btnH - 15, y1 = y2 - btnH - gap;
                if (pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH) { this.overlay.flipH = !this.overlay.flipH; this.updateRelativeFromAbsolute(); this.setDirtyCanvas(true); return true; }
                if (pos[0] >= 15 + btnW + gap && pos[0] <= 15 + btnW + gap + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH) { this.overlay.flipV = !this.overlay.flipV; this.updateRelativeFromAbsolute(); this.setDirtyCanvas(true); return true; }
                if (pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y2 && pos[1] <= y2 + btnH) { this.sendTransforms(); return true; }
                if (pos[0] >= 15 + btnW + gap && pos[0] <= 15 + btnW + gap + btnW && pos[1] >= y2 && pos[1] <= y2 + btnH) { this.cancelEditing(); return true; }
            }
            return false;
        };

        nodeType.prototype.onMouseMove = function(event, pos) {
            if (!this.advancedMode && pos) {
                const btnW = (this.size[0] - 50) / 2, btnH = 30, gap = 10, y2 = this.size[1] - btnH - 15, y1 = y2 - btnH - gap;
                const prev = [this.btnFlipHHover, this.btnFlipVHover, this.btnApplyHover, this.btnCancelHover];
                this.btnFlipHHover = pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH;
                this.btnFlipVHover = pos[0] >= 15 + btnW + gap && pos[0] <= 15 + btnW + gap + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH;
                this.btnApplyHover = pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y2 && pos[1] <= y2 + btnH;
                this.btnCancelHover = pos[0] >= 15 + btnW + gap && pos[0] <= 15 + btnW + gap + btnW && pos[1] >= y2 && pos[1] <= y2 + btnH;
                if (prev.some((v, i) => v !== [this.btnFlipHHover, this.btnFlipVHover, this.btnApplyHover, this.btnCancelHover][i])) this.setDirtyCanvas(true);
            }
            if (!this.dragType || !this.isEditing || this.isLoading || !this.dragState) return;
            const { rectX, rectY } = this.getCanvasMetrics();
            const mx = pos[0], my = pos[1];
            const worldMx = (mx - rectX - this.dragState.viewOffsetX) / this.dragState.viewScale;
            const worldMy = (my - rectY - this.dragState.viewOffsetY) / this.dragState.viewScale;
            const dx = worldMx - this.dragState.startMouseX, dy = worldMy - this.dragState.startMouseY;
            switch(this.dragType) {
                case 'move': this.overlay.x = this.dragState.startX + dx; this.overlay.y = this.dragState.startY + dy; break;
                case 'rotate': { const cx = this.overlay.x, cy = this.overlay.y; const sA = Math.atan2(this.dragState.startMouseY - cy, this.dragState.startMouseX - cx); const cA = Math.atan2(worldMy - cy, worldMx - cx); this.overlay.rotation = this.dragState.startRotation + (cA - sA) * 180 / Math.PI; break; }
                case 'scale-br': case 'scale-bl': case 'scale-tr': case 'scale-tl': { const cD = Math.hypot(worldMx - this.overlay.x, worldMy - this.overlay.y); const sD = this.dragState.startDist || 1; const sc = Math.max(0.05, cD / sD); this.overlay.width = Math.max(40, this.dragState.startW * sc); this.overlay.height = Math.max(40, this.dragState.startH * sc); this.overlay.x = this.dragState.startX; this.overlay.y = this.dragState.startY; break; }
                case 'scale-r': case 'scale-l': case 'scale-b': case 'scale-t': { const aR = this.dragState.startRotation * Math.PI / 180; const c = Math.cos(aR), s = Math.sin(aR); const lDx = dx * c + dy * s, lDy = -dx * s + dy * c; let fW = this.dragState.startW, fH = this.dragState.startH; if(this.dragType === 'scale-r') fW += lDx; else if(this.dragType === 'scale-l') fW -= lDx; else if(this.dragType === 'scale-b') fH += lDy; else fH -= lDy; if(fW < 40) fW = 40; if(fH < 40) fH = 40; this.overlay.width = fW; this.overlay.height = fH; this.overlay.x = this.dragState.startX; this.overlay.y = this.dragState.startY; break; }
                case 'feather-center': {
                    const rD = -this.dragState.startRotation * Math.PI / 180;
                    const c = Math.cos(rD), s = Math.sin(rD);
                    const rdx = dx * c - dy * s, rdy = dx * s + dy * c;
                    const flipX = this.overlay.flipH ? -1 : 1;
                    const flipY = this.overlay.flipV ? -1 : 1;
                    this.featherCenter.x = Math.max(0, Math.min(1, this.dragState.featherStartX + (rdx * flipX) / this.dragState.startW));
                    this.featherCenter.y = Math.max(0, Math.min(1, this.dragState.featherStartY + (rdy * flipY) / this.dragState.startH));
                    break;
                }
            }
            this.previewDirty = true; this.setDirtyCanvas(true);
        };

        nodeType.prototype.onMouseUp = function() {
            if (this.dragType) {
                this.updateRelativeFromAbsolute();
                if (!this.advancedMode) {
                    this.computeAndApplyView();
                }
            }
            this.dragType = null; this.dragState = null;
        };
    }
});

window.addEventListener("beforeunload", () => {
    const nodes = (app.graph && app.graph._nodes)
        ? app.graph._nodes.filter(n => n.type === "RSCollage")
        : [];
    nodes.forEach(n => {
        try {
            navigator.sendBeacon("/rayko/rs_collage/cleanup",
                JSON.stringify({ node_id: String(n.id) }));
        } catch(e) {}
    });
});