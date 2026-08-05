import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

let activeRSCollageNode = null;

function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

app.registerExtension({
    name: "RaykoStudio.RSCollage",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "RSCollage") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        const origOnConfigure = nodeType.prototype.onConfigure;
        const origSerialize = nodeType.prototype.serialize;

        nodeType.prototype.onConfigure = function(data) {
            const result = origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;
            
            // Восстанавливаем состояние из this.properties при загрузке ноды
            if (this.properties) {
                if (this.properties.overlayRelative) {
                    this.overlayRelative = { ...this.properties.overlayRelative };
                    this.updateOverlayAbsolute();
                }
                if (this.properties.featherCenter) {
                    this.featherCenter = { ...this.properties.featherCenter };
                }
                if (this.properties.opacity !== undefined) this.opacity = this.properties.opacity;
                if (this.properties.featherType !== undefined) this.featherType = this.properties.featherType;
                if (this.properties.blurRadius !== undefined) this.blurRadius = this.properties.blurRadius;
                if (this.properties.blurHardness !== undefined) this.blurHardness = this.properties.blurHardness;
                
                // Синхронизируем нативные виджеты с восстановленными значениями
                this._syncWidgetsFromState();
            }
            
            return result;
        };

        nodeType.prototype.serialize = function() {
            // Сохраняем текущее состояние в this.properties перед сериализацией графа
            if (this.properties) {
                this.properties.overlayRelative = { ...this.overlayRelative };
                this.properties.featherCenter = { ...this.featherCenter };
                this.properties.opacity = this.opacity;
                this.properties.featherType = this.featherType;
                this.properties.blurRadius = this.blurRadius;
                this.properties.blurHardness = this.blurHardness;
            }
            return origSerialize ? origSerialize.apply(this, arguments) : {};
        };

        nodeType.prototype.onNodeCreated = function() {
            const result = origOnNodeCreated ? origOnNodeCreated.apply(this, arguments) : undefined;

            this.overlay = { x: 0, y: 0, width: 100, height: 100, rotation: 0, flipH: false, flipV: false };
            this.overlayRelative = { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0, flipH: false, flipV: false };
            this.initialOverlayRelative = null;
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
            this.sliderDisplays = {};

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
            this.btnResetAllHover = false;

            this.featherPreviewCanvas = null;
            this.previewDirty = true;
            this.previewMaxSize = 512;
            this.pendingEditorData = null;

            this.heartbeatInterval = null;

            // Кастомные виджеты
            this.customSliderRects = [];
            this.customSliderHover = [false, false, false];
            this.customSliderDragging = -1;
            this.customResetBtnRects = [];
            this.customResetBtnHover = [false, false, false];
            this.customDropdownRect = null;
            this.customDropdownOpen = false;
            this.customDropdownHover = false;
            this.customDropdownOptions = ["None", "Radial Blur In", "Radial Blur Out", "Ellipse Blur In", "Ellipse Blur Out"];
            this.customDropdownOptionRects = [];
            this.customValueDisplayRects = [];

            // Инициализация this.properties для новых нод
            if (!this.properties) {
                this.properties = {};
            }
            if (!this.properties.overlayRelative) {
                this.properties.overlayRelative = { ...this.overlayRelative };
            }
            if (!this.properties.featherCenter) {
                this.properties.featherCenter = { ...this.featherCenter };
            }
            if (this.properties.opacity === undefined) this.properties.opacity = 1.0;
            if (this.properties.featherType === undefined) this.properties.featherType = "None";
            if (this.properties.blurRadius === undefined) this.properties.blurRadius = 50;
            if (this.properties.blurHardness === undefined) this.properties.blurHardness = 0;

            const syncWidgetValue = (widgetName, value) => {
                const widget = this.widgets?.find(w => w.name === widgetName);
                if (widget) {
                    widget.value = value;
                }
            };

            // Агрессивно прячем нативные виджеты
            ["opacity", "feather_type", "blur_radius", "blur_hardness"].forEach(n => {
                const w = this.widgets?.find(w => w.name === n);
                if (w) {
                    w.hidden = true;
                    w.computeSize = () => [0, 0];
                    w.y = 0;
                    w.disabled = true;
                }
            });

            // Метод синхронизации состояния с this.properties и нативными виджетами
            this._syncProperties = function() {
                if (!this.properties) this.properties = {};
                this.properties.overlayRelative = { ...this.overlayRelative };
                this.properties.featherCenter = { ...this.featherCenter };
                this.properties.opacity = this.opacity;
                this.properties.featherType = this.featherType;
                this.properties.blurRadius = this.blurRadius;
                this.properties.blurHardness = this.blurHardness;
                
                syncWidgetValue("opacity", this.opacity);
                syncWidgetValue("feather_type", this.featherType);
                syncWidgetValue("blur_radius", this.blurRadius);
                syncWidgetValue("blur_hardness", this.blurHardness);
            };
            
            // Алиас для обратной совместимости вызовов
            this._syncWidgetsFromState = this._syncProperties;

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
                this.sidePanel.style.cssText = 'width:320px;background:#151515;border-left:1px solid #333;padding:16px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;overflow-y:auto;';

                const makeLabel = (txt) => {
                    const l = document.createElement('label');
                    l.textContent = txt;
                    l.style.cssText = 'color:#aaa;font-size:11px;font-weight:600;margin-bottom:-4px;display:block;';
                    return l;
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

                const makeSlider = (label, key, min, max, step, isFloat = false) => {
                    const container = document.createElement('div');
                    container.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
                    
                    const lbl = document.createElement('label');
                    lbl.textContent = label;
                    lbl.style.cssText = 'color:#aaa;font-size:11px;font-weight:600;';
                    container.appendChild(lbl);
                    
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
                    
                    const slider = document.createElement('input');
                    slider.type = 'range';
                    slider.min = min;
                    slider.max = max;
                    slider.step = step;
                    slider.style.cssText = 'flex:1;height:4px;background:#252525;border-radius:2px;outline:none;cursor:pointer;-webkit-appearance:none;';
                    
                    const valueDisplay = document.createElement('div');
                    valueDisplay.style.cssText = 'min-width:50px;text-align:center;background:#252525;color:#4CAF50;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;font-weight:600;transition:0.15s;';
                    
                    const resetBtn = document.createElement('button');
                    resetBtn.textContent = '🔄️';
                    resetBtn.style.cssText = 'width:28px;height:28px;background:#252525;color:#888;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:0.15s;flex-shrink:0;';
                    resetBtn.onmouseenter = () => { resetBtn.style.background = '#2a2a2a'; resetBtn.style.color = '#fff'; resetBtn.style.borderColor = '#4CAF50'; };
                    resetBtn.onmouseleave = () => { resetBtn.style.background = '#252525'; resetBtn.style.color = '#888'; resetBtn.style.borderColor = '#444'; };
                    
                    const updateValue = (val) => {
                        val = Math.max(min, Math.min(max, val));
                        slider.value = val;
                        valueDisplay.textContent = isFloat ? val.toFixed(2) : String(Math.round(val));
                        
                        if (key === 'opacity') {
                            this.opacity = val / 100;
                        } else if (key === 'blurRadius') {
                            this.blurRadius = Math.round(val);
                        } else if (key === 'blurHardness') {
                            this.blurHardness = Math.round(val);
                        }
                        
                        this._syncProperties();
                        this.previewDirty = true;
                        this.setDirtyCanvas(true);
                    };
                    
                    let initialValue;
                    if (key === 'opacity') initialValue = this.opacity * 100;
                    else if (key === 'blurRadius') initialValue = this.blurRadius;
                    else if (key === 'blurHardness') initialValue = this.blurHardness;
                    
                    slider.value = initialValue;
                    valueDisplay.textContent = isFloat ? initialValue.toFixed(2) : String(Math.round(initialValue));
                    
                    slider.oninput = () => {
                        const val = isFloat ? parseFloat(slider.value) : parseInt(slider.value);
                        updateValue(val);
                    };
                    
                    valueDisplay.onclick = (e) => {
                        e.stopPropagation();
                        const popup = document.createElement('div');
                        popup.style.cssText = 'position:fixed;z-index:10004;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:8px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;';
                        
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.value = slider.value;
                        input.min = min;
                        input.max = max;
                        input.step = step;
                        input.style.cssText = 'width:100px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:12px;outline:none;';
                        
                        const saveBtn = document.createElement('button');
                        saveBtn.textContent = 'OK';
                        saveBtn.style.cssText = 'background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;';
                        
                        const doSave = () => {
                            let num = isFloat ? parseFloat(input.value) : parseInt(input.value);
                            if (isNaN(num)) num = parseFloat(slider.value);
                            updateValue(num);
                            popup.remove();
                        };
                        
                        saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); doSave(); };
                        input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doSave(); } };
                        
                        popup.appendChild(input);
                        popup.appendChild(saveBtn);
                        document.body.appendChild(popup);
                        
                        const popupWidth = popup.offsetWidth || 180;
                        const popupHeight = popup.offsetHeight || 40;
                        const rect = valueDisplay.getBoundingClientRect();
                        let leftPos = rect.right + 8;
                        let topPos = rect.top + (rect.height - popupHeight) / 2;
                        
                        if (leftPos + popupWidth > window.innerWidth - 10) {
                            leftPos = rect.left - popupWidth - 8;
                        }
                        if (topPos < 10) topPos = 10;
                        if (topPos + popupHeight > window.innerHeight - 10) {
                            topPos = window.innerHeight - popupHeight - 10;
                        }
                        
                        popup.style.left = leftPos + 'px';
                        popup.style.top = topPos + 'px';
                        
                        setTimeout(() => { input.focus(); input.select(); }, 50);
                        
                        setTimeout(() => {
                            const closeHandler = (ev) => {
                                if (!popup.contains(ev.target)) {
                                    popup.remove();
                                    document.removeEventListener('mousedown', closeHandler);
                                }
                            };
                            document.addEventListener('mousedown', closeHandler);
                        }, 100);
                    };
                    
                    resetBtn.onclick = (e) => {
                        e.stopPropagation();
                        let defaultVal;
                        if (key === 'opacity') defaultVal = 100;
                        else if (key === 'blurRadius') defaultVal = 50;
                        else if (key === 'blurHardness') defaultVal = 0;
                        updateValue(defaultVal);
                    };
                    
                    this.overlayInputs[key] = slider;
                    this.sliderDisplays[key] = valueDisplay;
                    
                    row.appendChild(slider);
                    row.appendChild(valueDisplay);
                    row.appendChild(resetBtn);
                    container.appendChild(row);
                    return container;
                };

                const makeSelect = (opts, val) => {
                    const s = document.createElement('select');
                    opts.forEach(o => {
                        const op = document.createElement('option');
                        op.value = o; op.textContent = o.toUpperCase();
                        if (o === val) op.selected = true;
                        s.appendChild(op);
                    });
                    s.style.cssText = 'width:100%;background:#252525;color:#eee;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px;outline:none;';
                    return s;
                };

                const div = () => { const d = document.createElement('div'); d.style.cssText = 'height:1px;background:#333;margin:8px 0;'; return d; };

                const buttonContainer = document.createElement('div');
                buttonContainer.style.cssText = 'position:sticky;top:0;background:#151515;z-index:10;padding:0 0 8px 0;border-bottom:1px solid #333;margin-bottom:8px;';
                this.sidePanel.appendChild(buttonContainer);

                this.btnNormal = makeBtn("↩️ NORMAL MODE", "#00B3B3", () => this._toggleAdvancedMode());
                buttonContainer.appendChild(this.btnNormal);
                this.btnApply = makeBtn("✔️ APPLY", "#4CAF50", () => { this.sendTransforms(); this._toggleAdvancedMode(); });
                buttonContainer.appendChild(this.btnApply);
                this.btnCancel = makeBtn("❌ CANCEL", "#dc3545", () => { this.cancelEditing(); this._toggleAdvancedMode(); });
                buttonContainer.appendChild(this.btnCancel);
                this.btnResetAllSidebar = makeBtn("🔄 RESET ALL", "#FF9800", () => { this._resetAllParameters(); });
                buttonContainer.appendChild(this.btnResetAllSidebar);

                this.sidePanel.appendChild(div());

                this.sidePanel.appendChild(makeSlider("OPACITY", "opacity", 0, 100, 1, false));

                this.sidePanel.appendChild(div());

                this.sidePanel.appendChild(makeLabel("FEATHER TYPE"));
                this.overlayInputs.featherType = makeSelect(["None", "Radial Blur In", "Radial Blur Out", "Ellipse Blur In", "Ellipse Blur Out"], this.featherType);
                this.sidePanel.appendChild(this.overlayInputs.featherType);
                this.overlayInputs.featherType.addEventListener('change', () => {
                    this.featherType = this.overlayInputs.featherType.value;
                    this._syncProperties();
                    this.previewDirty = true;
                    this.setDirtyCanvas(true);
                });
                
                this.sidePanel.appendChild(makeSlider("BLUR RADIUS", "blurRadius", 0, 100, 1, false));
                this.sidePanel.appendChild(makeSlider("BLUR HARDNESS", "blurHardness", 0, 100, 1, false));

                this.sidePanel.appendChild(div());

                this.sidePanel.appendChild(makeBtn("↔️ FLIP HORIZONTAL", "#2196F3", () => {
                    this.overlay.flipH = !this.overlay.flipH;
                    this.updateRelativeFromAbsolute();
                    this._syncProperties();
                    this.computeAndApplyView();
                    this.previewDirty = true;
                    this.setDirtyCanvas(true);
                }));
                this.sidePanel.appendChild(makeBtn("↕️ FLIP VERTICAL", "#2196F3", () => {
                    this.overlay.flipV = !this.overlay.flipV;
                    this.updateRelativeFromAbsolute();
                    this._syncProperties();
                    this.computeAndApplyView();
                    this.previewDirty = true;
                    this.setDirtyCanvas(true);
                }));

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

        nodeType.prototype.getWorldPoint = function(localX, localY) {
            const dx = (localX - 0.5) * this.overlay.width;
            const dy = (localY - 0.5) * this.overlay.height;
            let fx = dx * (this.overlay.flipH ? -1 : 1);
            let fy = dy * (this.overlay.flipV ? -1 : 1);
            const rot = this.overlay.rotation * Math.PI / 180;
            const cos = Math.cos(rot);
            const sin = Math.sin(rot);
            return {
                x: this.overlay.x + fx * cos - fy * sin,
                y: this.overlay.y + fx * sin + fy * cos
            };
        };

        nodeType.prototype.getLocalPoint = function(worldX, worldY) {
            const dx = worldX - this.overlay.x;
            const dy = worldY - this.overlay.y;
            const rot = -this.overlay.rotation * Math.PI / 180;
            const cos = Math.cos(rot);
            const sin = Math.sin(rot);
            let lx = dx * cos - dy * sin;
            let ly = dx * sin + dy * cos;
            if (this.overlay.flipH) lx = -lx;
            if (this.overlay.flipV) ly = -ly;
            return {
                x: 0.5 + lx / this.overlay.width,
                y: 0.5 + ly / this.overlay.height
            };
        };

        nodeType.prototype._syncOverlayUI = function() {
            if (!this.advancedMode) return;
            if (this.overlayInputs.opacity) this.overlayInputs.opacity.value = Math.round(this.opacity * 100);
            if (this.sliderDisplays.opacity) this.sliderDisplays.opacity.textContent = String(Math.round(this.opacity * 100));
            if (this.overlayInputs.featherType) this.overlayInputs.featherType.value = this.featherType;
            if (this.overlayInputs.blurRadius) this.overlayInputs.blurRadius.value = this.blurRadius;
            if (this.sliderDisplays.blurRadius) this.sliderDisplays.blurRadius.textContent = String(this.blurRadius);
            if (this.overlayInputs.blurHardness) this.overlayInputs.blurHardness.value = this.blurHardness;
            if (this.sliderDisplays.blurHardness) this.sliderDisplays.blurHardness.textContent = String(this.blurHardness);
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

        nodeType.prototype._resetAllParameters = function() {
            this.opacity = 1.0;
            this.featherType = "None";
            this.blurRadius = 50;
            this.blurHardness = 0;
            this.featherCenter = { x: 0.5, y: 0.5 };

            if (this.initialOverlayRelative) {
                this.overlayRelative = { ...this.initialOverlayRelative };
                this.updateOverlayAbsolute();
            }

            this._syncProperties();
            this._syncOverlayUI();
            this.computeAndApplyView();
            this.previewDirty = true;
            this.setDirtyCanvas(true);
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

                ctx.restore();
            }
            ctx.restore();

            if (this.overlayImage && this.featherType !== "None" && this.blurRadius > 0) {
                const worldPos = this.getWorldPoint(this.featherCenter.x, this.featherCenter.y);
                const screenX = rectX + useOffsetX + worldPos.x * useScale;
                const screenY = rectY + useOffsetY + worldPos.y * useScale;

                const crossSize = 18 / useScale;
                ctx.save();
                ctx.shadowColor = "rgba(0,0,0,0.6)";
                ctx.shadowBlur = 8 / useScale;
                ctx.fillStyle = "#FF6B00";
                ctx.strokeStyle = "#FFFFFF";
                ctx.lineWidth = 2 / useScale;
                ctx.beginPath();
                ctx.arc(screenX, screenY, crossSize * 0.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.strokeStyle = "#FFFFFF";
                ctx.lineWidth = 2.5 / useScale;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(screenX - crossSize, screenY);
                ctx.lineTo(screenX + crossSize, screenY);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(screenX, screenY - crossSize);
                ctx.lineTo(screenX, screenY + crossSize);
                ctx.stroke();
                ctx.fillStyle = "#FFFFFF";
                ctx.beginPath();
                ctx.arc(screenX, screenY, 2 / useScale, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            ctx.fillStyle = "#ff9800";
            ctx.font = "12px Arial";
            ctx.textAlign = "left";
            ctx.fillText(`EDITING (Scale: ${(useScale * 100).toFixed(0)}%)`, this.overlayCanvas.width - 200, this.overlayCanvas.height - 20);
        };

        nodeType.prototype.generateFeatherPreview = function() {
            if (!this.overlayImage || this.featherType === "None") {
                this.featherPreviewCanvas = null;
                this.previewDirty = false;
                return;
            }
            const rVal = this.blurRadius;
            if (rVal <= 0) {
                this.featherPreviewCanvas = null;
                this.previewDirty = false;
                return;
            }

            const mW = Math.min(this.realOverlay.width, this.previewMaxSize);
            const mH = Math.min(this.realOverlay.height, this.previewMaxSize);
            const sc = Math.min(1, Math.min(mW / this.realOverlay.width, mH / this.realOverlay.height));
            const w = Math.round(this.realOverlay.width * sc);
            const h = Math.round(this.realOverlay.height * sc);

            if (!this.featherPreviewCanvas || this.featherPreviewCanvas.width !== w || this.featherPreviewCanvas.height !== h) {
                this.featherPreviewCanvas = document.createElement('canvas');
                this.featherPreviewCanvas.width = w;
                this.featherPreviewCanvas.height = h;
            }

            const ctx = this.featherPreviewCanvas.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(this.overlayImage, 0, 0, w, h);

            const imgD = ctx.getImageData(0, 0, w, h);
            const d = imgD.data;
            const cx = this.featherCenter.x * w;
            const cy = this.featherCenter.y * h;
            const isRadial = this.featherType.includes("Radial Blur");
            const isEllipse = this.featherType.includes("Ellipse Blur");
            const ratio = rVal / 100.0;
            const hardness = this.blurHardness / 100.0;
            const overshoot = 1.15 + (1.0 - hardness) * 0.15;
            const exp = 1.0 + hardness * 30.0;
            const isOut = this.featherType.includes("Out");

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    if (d[i + 3] === 0) continue;
                    let dist;
                    if (isRadial) {
                        const maxDist = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) || 1;
                        const fw = Math.max(ratio * maxDist * overshoot, 1e-6);
                        dist = Math.hypot(x - cx, y - cy) / fw;
                    } else if (isEllipse) {
                        const dX = Math.max(cx, w - cx) || 1;
                        const dY = Math.max(cy, h - cy) || 1;
                        const dx = Math.abs(x - cx) / dX;
                        const dy = Math.abs(y - cy) / dY;
                        const E = Math.hypot(dx, dy);
                        const fw = Math.max(ratio * overshoot, 1e-6);
                        dist = E / fw;
                    }
                    const norm = Math.min(1, Math.max(0, dist));
                    let mask = 1.0 - Math.pow(norm, exp);
                    if (hardness >= 0.5) {
                        mask = mask < 0.02 ? 0 : (mask > 0.98 ? 1 : mask);
                    }
                    if (isOut) mask = 1.0 - mask;
                    d[i + 3] *= mask;
                }
            }
            ctx.putImageData(imgD, 0, 0);
            this.previewDirty = false;
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

            this._syncProperties();

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
                        
                        this.initialOverlayRelative = { ...this.overlayRelative };
                        
                        this.updateOverlayAbsolute();
                        this._syncProperties();
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

        nodeType.prototype.getRealTransform = function() {
            const dS = this.canvasRealWidth / (this.displayWidth || 1);
            const absX = (this.overlay.x * dS) + (this.canvasRealWidth / 2), absY = (this.overlay.y * dS) + (this.canvasRealHeight / 2);
            return { x: absX, y: absY, scale_x: (this.overlay.width * dS) / (this.realOverlay.width || 1), scale_y: (this.overlay.height * dS) / (this.realOverlay.height || 1), rotation: this.overlay.rotation, flip_h: this.overlay.flipH, flip_v: this.overlay.flipV };
        };

        nodeType.prototype.computeScreenHandles = function(rectX, rectY, useScale, useOffsetX, useOffsetY) {
            const hw = this.overlay.width / 2, hh = this.overlay.height / 2, rot = this.overlay.rotation * Math.PI / 180;
            const cos = Math.cos(rot), sin = Math.sin(rot);
            const fx = this.overlay.flipH ? -1 : 1;
            const fy = this.overlay.flipV ? -1 : 1;
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
                let sx = loc[0] * fx;
                let sy = loc[1] * fy;
                const rx = sx * cos - sy * sin;
                const ry = sx * sin + sy * cos;
                screenHandles[name] = {
                    x: rectX + useOffsetX + (this.overlay.x + rx) * useScale,
                    y: rectY + useOffsetY + (this.overlay.y + ry) * useScale
                };
            }
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
            const canvasTopPadding = 180;
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
                    ctx.restore();
                }
                ctx.restore();

                if (this.overlayImage && this.featherType !== "None" && this.blurRadius > 0) {
                    const worldPos = this.getWorldPoint(this.featherCenter.x, this.featherCenter.y);
                    const screenX = rectX + useOffsetX + worldPos.x * useScale;
                    const screenY = rectY + useOffsetY + worldPos.y * useScale;
                    const crossSize = 12 / useScale;
                    ctx.save();
                    ctx.strokeStyle = "#FF0000";
                    ctx.lineWidth = 2 / useScale;
                    ctx.beginPath();
                    ctx.moveTo(screenX - crossSize, screenY);
                    ctx.lineTo(screenX + crossSize, screenY);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(screenX, screenY - crossSize);
                    ctx.lineTo(screenX, screenY + crossSize);
                    ctx.stroke();
                    ctx.fillStyle = "#2196F3";
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, 4 / useScale, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "#FFFFFF";
                    ctx.lineWidth = 1 / useScale;
                    ctx.stroke();
                    ctx.restore();
                }

                ctx.fillStyle = "#ff9800"; ctx.font = "12px Arial"; ctx.fillText(`EDITING (Scale: ${(useScale * 100).toFixed(0)}%)`, rectX + cSize - 160, rectY + cSize - 10);
            } else {
                ctx.fillStyle = "#888"; ctx.font = "12px Arial"; ctx.fillText("▶ Run queue to start", rectX + cSize / 2 - 65, rectY + cSize / 2);
            }

            const toggleBtnW = 150, toggleBtnH = 24, toggleBtnX = (this.size[0] - toggleBtnW) / 2, toggleBtnY = 15;
            ctx.fillStyle = "#2a2a2a"; ctx.strokeStyle = "#2196F3"; ctx.lineWidth = 2;
            drawRoundRect(ctx, toggleBtnX, toggleBtnY, toggleBtnW, toggleBtnH, 6);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#2196F3"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
            ctx.fillText("✨ ADVANCED MODE", toggleBtnX + toggleBtnW / 2, toggleBtnY + toggleBtnH / 2 + 4);

            const resetBtnY = toggleBtnY + toggleBtnH + 5;
            ctx.fillStyle = this.btnResetAllHover ? "#3a3a3a" : "#2a2a2a";
            ctx.strokeStyle = "#FF9800";
            ctx.lineWidth = 2;
            drawRoundRect(ctx, toggleBtnX, resetBtnY, toggleBtnW, toggleBtnH, 6);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#FF9800"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
            ctx.fillText("🔄 RESET ALL", toggleBtnX + toggleBtnW / 2, resetBtnY + toggleBtnH / 2 + 4);

            const widgetX = 15;
            const widgetW = this.size[0] - 30;
            const ROW_HEIGHT = 24;
            const ROW_GAP = 6;
            const startY = 74;

            this.customSliderRects = [];
            this.customValueDisplayRects = [];

            const sliders = [
                { label: "OPACITY", value: this.opacity * 100, min: 0, max: 100, step: 1, format: (v) => Math.round(v).toString(), key: "opacity" },
                { label: "BLUR RADIUS", value: this.blurRadius, min: 0, max: 100, step: 1, format: (v) => Math.round(v).toString(), key: "blur_radius" },
                { label: "BLUR HARDNESS", value: this.blurHardness, min: 0, max: 100, step: 1, format: (v) => Math.round(v).toString(), key: "blur_hardness" }
            ];

            sliders.forEach((slider, i) => {
                const rowY = startY + i * (ROW_HEIGHT + ROW_GAP);
                const isHover = this.customSliderHover?.[i] || false;
                const isActive = this.customSliderDragging === i;

                ctx.fillStyle = isHover ? "#2a2a2a" : "#252525";
                ctx.strokeStyle = isActive ? "#4CAF50" : (isHover ? "#4CAF50" : "#444");
                ctx.lineWidth = 1;
                drawRoundRect(ctx, widgetX, rowY, widgetW, ROW_HEIGHT, 4);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = "#aaa";
                ctx.font = "10px sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(slider.label, widgetX + 8, rowY + ROW_HEIGHT / 2);

                const trackX = widgetX + 110;
                const trackW = widgetW - 205;
                const trackY = rowY + ROW_HEIGHT / 2;
                const trackH = 3;

                ctx.fillStyle = "#444";
                ctx.fillRect(trackX, trackY - trackH / 2, trackW, trackH);

                const ratio = Math.max(0, Math.min(1, (slider.value - slider.min) / (slider.max - slider.min)));
                const fillW = trackW * ratio;
                ctx.fillStyle = "#4CAF50";
                ctx.fillRect(trackX, trackY - trackH / 2, fillW, trackH);

                const handleX = trackX + fillW;
                const handleSize = 12;
                ctx.fillStyle = "#fff";
                ctx.beginPath();
                ctx.arc(handleX, trackY, handleSize / 2, 0, Math.PI * 2);
                ctx.fill();

                const valueW = 50;
                const valueX = widgetX + widgetW - valueW - 30;
                ctx.fillStyle = "#222";
                ctx.strokeStyle = "#444";
                drawRoundRect(ctx, valueX, rowY + 3, valueW, ROW_HEIGHT - 6, 3);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = "#4CAF50";
                ctx.font = "10px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(slider.format(slider.value), valueX + valueW / 2, rowY + ROW_HEIGHT / 2);

                this.customValueDisplayRects.push({
                    x: valueX,
                    y: rowY + 3,
                    w: valueW,
                    h: ROW_HEIGHT - 6,
                    key: slider.key,
                    min: slider.min,
                    max: slider.max,
                    step: slider.step,
                    currentValue: slider.value
                });

                const resetBtnSize = 24;
                const resetBtnX = widgetX + widgetW - resetBtnSize;
                const resetBtnY = rowY + (ROW_HEIGHT - resetBtnSize) / 2;
                const isResetHover = this.customResetBtnHover?.[i] || false;

                ctx.fillStyle = isResetHover ? "#2a2a2a" : "#252525";
                ctx.strokeStyle = isResetHover ? "#4CAF50" : "#444";
                drawRoundRect(ctx, resetBtnX, resetBtnY, resetBtnSize, resetBtnSize, 4);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = isResetHover ? "#fff" : "#888";
                ctx.font = "14px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("🔄", resetBtnX + resetBtnSize / 2, resetBtnY + resetBtnSize / 2);

                this.customResetBtnRects.push({ x: resetBtnX, y: resetBtnY, w: resetBtnSize, h: resetBtnSize, key: slider.key });
                this.customSliderRects.push({
                    key: slider.key,
                    sliderRect: { x: trackX - 6, y: rowY, w: trackW + 12, h: ROW_HEIGHT },
                    sliderTrackX: trackX,
                    sliderTrackWidth: trackW,
                    min: slider.min,
                    max: slider.max,
                    step: slider.step
                });
            });

            const dropdownY = startY + 3 * (ROW_HEIGHT + ROW_GAP);
            const dropdownH = ROW_HEIGHT;
            const isDropdownHover = this.customDropdownHover || false;

            ctx.fillStyle = isDropdownHover ? "#2a2a2a" : "#252525";
            ctx.strokeStyle = this.customDropdownOpen ? "#4CAF50" : (isDropdownHover ? "#4CAF50" : "#444");
            ctx.lineWidth = 1;
            drawRoundRect(ctx, widgetX, dropdownY, widgetW, dropdownH, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#aaa";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText("FEATHER TYPE", widgetX + 8, dropdownY + dropdownH / 2);

            const dropdownValueX = widgetX + 100;
            const dropdownValueW = widgetW - 110;
            ctx.fillStyle = "#222";
            ctx.strokeStyle = "#444";
            drawRoundRect(ctx, dropdownValueX, dropdownY + 3, dropdownValueW, dropdownH - 6, 3);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#4CAF50";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(this.featherType.toUpperCase(), dropdownValueX + dropdownValueW / 2, dropdownY + dropdownH / 2);

            const arrowX = dropdownValueX + dropdownValueW - 15;
            const arrowY = dropdownY + dropdownH / 2;
            ctx.fillStyle = "#888";
            ctx.beginPath();
            ctx.moveTo(arrowX - 4, arrowY - 2);
            ctx.lineTo(arrowX + 4, arrowY - 2);
            ctx.lineTo(arrowX, arrowY + 3);
            ctx.closePath();
            ctx.fill();

            this.customDropdownRect = { x: widgetX, y: dropdownY, w: widgetW, h: dropdownH };

            if (this.customDropdownOpen) {
                const optionH = 22;
                const listY = dropdownY + dropdownH + 2;
                this.customDropdownOptionRects = [];

                this.customDropdownOptions.forEach((option, i) => {
                    const optY = listY + i * optionH;
                    const isSelected = option === this.featherType;

                    ctx.fillStyle = isSelected ? "#2a2a2a" : "#1e1e1e";
                    ctx.strokeStyle = "#444";
                    drawRoundRect(ctx, dropdownValueX, optY, dropdownValueW, optionH, 3);
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = isSelected ? "#4CAF50" : "#aaa";
                    ctx.font = "10px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(option.toUpperCase(), dropdownValueX + dropdownValueW / 2, optY + optionH / 2);

                    this.customDropdownOptionRects.push({ x: dropdownValueX, y: optY, w: dropdownValueW, h: optionH, value: option });
                });
            }

            const btnW = (this.size[0] - 50) / 2, btnH = 30, gap = 10, y2 = this.size[1] - btnH - 15, y1 = y2 - btnH - gap;
            [[15, y1, "↔️ FLIP H", this.btnFlipHHover, "#2196F3"], [15 + btnW + gap, y1, "️ FLIP V", this.btnFlipVHover, "#2196F3"], [15, y2, "✔️ APPLY", this.btnApplyHover, "#4CAF50"], [15 + btnW + gap, y2, "❌ CANCEL", this.btnCancelHover, "#dc3545"]].forEach(([bx, by, txt, hov, col]) => {
                ctx.fillStyle = hov ? "#444" : "#2a2a2a"; drawRoundRect(ctx, bx, by, btnW, btnH, 6); ctx.fill(); ctx.strokeStyle = col; ctx.stroke(); ctx.fillStyle = col; ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText(txt, bx + btnW / 2, by + btnH / 2 + 4);
            });
        };

        nodeType.prototype.onMouseDown = function(event, pos) {
            if (!this.advancedMode && pos) {
                const toggleBtnW = 150, toggleBtnH = 24, toggleBtnX = (this.size[0] - toggleBtnW) / 2, toggleBtnY = 15;
                if (pos[0] >= toggleBtnX && pos[0] <= toggleBtnX + toggleBtnW && pos[1] >= toggleBtnY && pos[1] <= toggleBtnY + toggleBtnH) { 
                    this._toggleAdvancedMode(); 
                    return true; 
                }
                
                const resetBtnY = toggleBtnY + toggleBtnH + 5;
                if (pos[0] >= toggleBtnX && pos[0] <= toggleBtnX + toggleBtnW && pos[1] >= resetBtnY && pos[1] <= resetBtnY + toggleBtnH) {
                    this._resetAllParameters();
                    return true;
                }
            }

            if (this.isEditing && !this.isLoading && this.overlayImage && this.featherType !== "None" && this.blurRadius > 0) {
                const { rectX, rectY } = this.getCanvasMetrics();
                const useScale = this.viewScale;
                const useOffsetX = this.viewOffsetX;
                const useOffsetY = this.viewOffsetY;
                const worldPos = this.getWorldPoint(this.featherCenter.x, this.featherCenter.y);
                const screenX = rectX + useOffsetX + worldPos.x * useScale;
                const screenY = rectY + useOffsetY + worldPos.y * useScale;
                const threshold = 20 / useScale;
                const dist = Math.hypot(pos[0] - screenX, pos[1] - screenY);
                if (dist < threshold) {
                    this.dragType = 'feather-center';
                    const { rectX: rX, rectY: rY } = this.getCanvasMetrics();
                    const worldMx = (pos[0] - rX - this.viewOffsetX) / this.viewScale;
                    const worldMy = (pos[1] - rY - this.viewOffsetY) / this.viewScale;
                    this.dragState = {
                        startMouseX: worldMx,
                        startMouseY: worldMy,
                        startFeatherX: this.featherCenter.x,
                        startFeatherY: this.featherCenter.y,
                        viewScale: this.viewScale,
                        viewOffsetX: this.viewOffsetX,
                        viewOffsetY: this.viewOffsetY
                    };
                    return true;
                }
            }

            if (this.customValueDisplayRects && pos) {
                for (const rect of this.customValueDisplayRects) {
                    if (pos[0] >= rect.x && pos[0] <= rect.x + rect.w &&
                        pos[1] >= rect.y && pos[1] <= rect.y + rect.h) {
                        const popup = document.createElement('div');
                        popup.style.cssText = 'position:fixed;z-index:10004;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:8px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;';
                        
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.value = rect.currentValue;
                        input.min = rect.min;
                        input.max = rect.max;
                        input.step = rect.step;
                        input.style.cssText = 'width:100px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:12px;outline:none;';
                        
                        const saveBtn = document.createElement('button');
                        saveBtn.textContent = 'OK';
                        saveBtn.style.cssText = 'background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;';
                        
                        const doSave = () => {
                            let num = parseInt(input.value);
                            if (isNaN(num)) num = rect.currentValue;
                            num = Math.max(rect.min, Math.min(rect.max, num));
                            
                            if (rect.key === "opacity") {
                                this.opacity = num / 100;
                            } else if (rect.key === "blur_radius") {
                                this.blurRadius = num;
                            } else if (rect.key === "blur_hardness") {
                                this.blurHardness = num;
                            }
                            
                            this._syncProperties();
                            this.previewDirty = true;
                            this.setDirtyCanvas(true);
                            popup.remove();
                        };
                        
                        saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); doSave(); };
                        input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doSave(); } };
                        
                        popup.appendChild(input);
                        popup.appendChild(saveBtn);
                        document.body.appendChild(popup);
                        
                        setTimeout(() => { input.focus(); input.select(); }, 50);
                        
                        setTimeout(() => {
                            const closeHandler = (ev) => {
                                if (!popup.contains(ev.target)) {
                                    popup.remove();
                                    document.removeEventListener('mousedown', closeHandler);
                                }
                            };
                            document.addEventListener('mousedown', closeHandler);
                        }, 100);
                        
                        return true;
                    }
                }
            }

            if (this.customSliderRects && pos) {
                for (let i = 0; i < this.customSliderRects.length; i++) {
                    const rect = this.customSliderRects[i];
                    if (pos[0] >= rect.sliderRect.x && pos[0] <= rect.sliderRect.x + rect.sliderRect.w &&
                        pos[1] >= rect.sliderRect.y && pos[1] <= rect.sliderRect.y + rect.sliderRect.h) {
                        this.customSliderDragging = i;
                        const clickPos = pos[0] - rect.sliderTrackX;
                        const normalizedClick = Math.max(0, Math.min(1, clickPos / rect.sliderTrackWidth));
                        const clickValue = rect.min + normalizedClick * (rect.max - rect.min);
                        if (rect.key === "opacity") {
                            this.opacity = clickValue / 100;
                        } else if (rect.key === "blur_radius") {
                            this.blurRadius = Math.round(clickValue);
                        } else if (rect.key === "blur_hardness") {
                            this.blurHardness = Math.round(clickValue);
                        }
                        this._syncProperties();
                        this.previewDirty = true;
                        this.setDirtyCanvas(true);
                        return true;
                    }
                }
            }

            if (this.customDropdownRect && pos) {
                if (pos[0] >= this.customDropdownRect.x && pos[0] <= this.customDropdownRect.x + this.customDropdownRect.w &&
                    pos[1] >= this.customDropdownRect.y && pos[1] <= this.customDropdownRect.y + this.customDropdownRect.h) {
                    this.customDropdownOpen = !this.customDropdownOpen;
                    this.setDirtyCanvas(true);
                    return true;
                }
            }

            if (this.customDropdownOpen && this.customDropdownOptionRects && pos) {
                for (const optRect of this.customDropdownOptionRects) {
                    if (pos[0] >= optRect.x && pos[0] <= optRect.x + optRect.w &&
                        pos[1] >= optRect.y && pos[1] <= optRect.y + optRect.h) {
                        this.featherType = optRect.value;
                        this.customDropdownOpen = false;
                        this._syncProperties();
                        this.previewDirty = true;
                        this.setDirtyCanvas(true);
                        return true;
                    }
                }
                this.customDropdownOpen = false;
                this.setDirtyCanvas(true);
            }

            if (this.customResetBtnRects && pos) {
                for (const rect of this.customResetBtnRects) {
                    if (pos[0] >= rect.x && pos[0] <= rect.x + rect.w &&
                        pos[1] >= rect.y && pos[1] <= rect.y + rect.h) {
                        if (rect.key === "opacity") {
                            this.opacity = 1.0;
                        } else if (rect.key === "blur_radius") {
                            this.blurRadius = 50;
                        } else if (rect.key === "blur_hardness") {
                            this.blurHardness = 0;
                        }
                        this._syncProperties();
                        this.previewDirty = true;
                        this.setDirtyCanvas(true);
                        return true;
                    }
                }
            }

            if (this.isEditing && !this.isLoading && this.overlayImage) {
                const { cSize, rectX, rectY } = this.getCanvasMetrics();
                const mx = pos[0], my = pos[1];
                const frozenScale = this.viewScale, frozenOffsetX = this.viewOffsetX, frozenOffsetY = this.viewOffsetY;
                const worldMx = (mx - rectX - frozenOffsetX) / frozenScale, worldMy = (my - rectY - frozenOffsetY) / frozenScale;
                const screenHandles = this.computeScreenHandles(rectX, rectY, frozenScale, frozenOffsetX, frozenOffsetY);
                const cornerSize = 14, edgeSize = 18, rotateSize = 22;
                let detectedType = null, minDist = Infinity;
                const checkHandle = (name, h, threshold) => { const dist = Math.hypot(mx - h.x, my - h.y); if (dist < threshold && dist < minDist) { detectedType = name; minDist = dist; } };
                for (const [name, hPos] of Object.entries(screenHandles)) {
                    const isEdge = ['scale-t', 'scale-b', 'scale-l', 'scale-r'].includes(name);
                    const threshold = name === 'rotate' ? rotateSize : (isEdge ? edgeSize : cornerSize);
                    checkHandle(name, hPos, threshold);
                }
                this.dragType = detectedType;
                if (this.dragType) {
                    this.dragState = { startMouseX: worldMx, startMouseY: worldMy, startX: this.overlay.x, startY: this.overlay.y, startW: this.overlay.width, startH: this.overlay.height, startRotation: this.overlay.rotation, aspect: this.overlay.width / this.overlay.height, viewScale: frozenScale, viewOffsetX: frozenOffsetX, viewOffsetY: frozenOffsetY, startDist: ['scale-tl', 'scale-tr', 'scale-bl', 'scale-br'].includes(detectedType) ? Math.hypot(worldMx - this.overlay.x, worldMy - this.overlay.y) : 0 };
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
            }

            if (!this.advancedMode && pos) {
                const btnW = (this.size[0] - 50) / 2, btnH = 30, gap = 10, y2 = this.size[1] - btnH - 15, y1 = y2 - btnH - gap;
                
                if (pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH) {
                    this.overlay.flipH = !this.overlay.flipH;
                    this.updateRelativeFromAbsolute();
                    this._syncProperties();
                    this.computeAndApplyView();
                    this.previewDirty = true;
                    this.setDirtyCanvas(true);
                    return true;
                }
                if (pos[0] >= 15 + btnW + gap && pos[0] <= 15 + btnW + gap + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH) {
                    this.overlay.flipV = !this.overlay.flipV;
                    this.updateRelativeFromAbsolute();
                    this._syncProperties();
                    this.computeAndApplyView();
                    this.previewDirty = true;
                    this.setDirtyCanvas(true);
                    return true;
                }
                if (pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y2 && pos[1] <= y2 + btnH) { this.sendTransforms(); return true; }
                if (pos[0] >= 15 + btnW + gap && pos[0] <= 15 + btnW + gap + btnW && pos[1] >= y2 && pos[1] <= y2 + btnH) { this.cancelEditing(); return true; }
            }

            return false;
        };

        nodeType.prototype.onMouseMove = function(event, pos) {
            if (this.customSliderDragging >= 0 && event && event.buttons === 0) {
                this.customSliderDragging = -1;
                this.setDirtyCanvas(true);
            }

            if (this.customSliderDragging >= 0 && pos) {
                const rect = this.customSliderRects[this.customSliderDragging];
                const clickPos = pos[0] - rect.sliderTrackX;
                const normalizedClick = Math.max(0, Math.min(1, clickPos / rect.sliderTrackWidth));
                const clickValue = rect.min + normalizedClick * (rect.max - rect.min);
                if (rect.key === "opacity") {
                    this.opacity = clickValue / 100;
                } else if (rect.key === "blur_radius") {
                    this.blurRadius = Math.round(clickValue);
                } else if (rect.key === "blur_hardness") {
                    this.blurHardness = Math.round(clickValue);
                }
                this._syncProperties();
                this.previewDirty = true;
                this.setDirtyCanvas(true);
                return;
            }

            if (this.dragType === 'feather-center' && pos) {
                const { rectX, rectY } = this.getCanvasMetrics();
                const worldMx = (pos[0] - rectX - this.dragState.viewOffsetX) / this.dragState.viewScale;
                const worldMy = (pos[1] - rectY - this.dragState.viewOffsetY) / this.dragState.viewScale;
                const local = this.getLocalPoint(worldMx, worldMy);
                this.featherCenter.x = local.x;
                this.featherCenter.y = local.y;
                this._syncProperties();
                this.previewDirty = true;
                this.setDirtyCanvas(true);
                return;
            }

            if (!this.advancedMode && pos) {
                const toggleBtnW = 150, toggleBtnH = 24, toggleBtnX = (this.size[0] - toggleBtnW) / 2;
                const resetBtnY = 15 + toggleBtnH + 5;
                const prevResetAll = this.btnResetAllHover;
                this.btnResetAllHover = pos[0] >= toggleBtnX && pos[0] <= toggleBtnX + toggleBtnW && pos[1] >= resetBtnY && pos[1] <= resetBtnY + toggleBtnH;
                if (prevResetAll !== this.btnResetAllHover) this.setDirtyCanvas(true);

                const btnW = (this.size[0] - 50) / 2, btnH = 30, gap = 10, y2 = this.size[1] - btnH - 15, y1 = y2 - btnH - gap;
                const prev = [this.btnFlipHHover, this.btnFlipVHover, this.btnApplyHover, this.btnCancelHover];
                this.btnFlipHHover = pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH;
                this.btnFlipVHover = pos[0] >= 15 + btnW + gap && pos[0] <= 15 + btnW + gap + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH;
                this.btnApplyHover = pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y2 && pos[1] <= y2 + btnH;
                this.btnCancelHover = pos[0] >= 15 + btnW + gap && pos[0] <= 15 + btnW + gap + btnW && pos[1] >= y2 && pos[1] <= y2 + btnH;
                if (prev.some((v, i) => v !== [this.btnFlipHHover, this.btnFlipVHover, this.btnApplyHover, this.btnCancelHover][i])) this.setDirtyCanvas(true);

                if (this.customSliderRects) {
                    const prevHover = [...this.customSliderHover];
                    for (let i = 0; i < this.customSliderRects.length; i++) {
                        const rect = this.customSliderRects[i];
                        this.customSliderHover[i] = pos[0] >= rect.sliderRect.x && pos[0] <= rect.sliderRect.x + rect.sliderRect.w &&
                                                     pos[1] >= rect.sliderRect.y && pos[1] <= rect.sliderRect.y + rect.sliderRect.h;
                    }
                    if (prevHover.some((v, i) => v !== this.customSliderHover[i])) this.setDirtyCanvas(true);
                }

                if (this.customResetBtnRects) {
                    const prevResetHover = [...this.customResetBtnHover];
                    for (let i = 0; i < this.customResetBtnRects.length; i++) {
                        const rect = this.customResetBtnRects[i];
                        this.customResetBtnHover[i] = pos[0] >= rect.x && pos[0] <= rect.x + rect.w &&
                                                       pos[1] >= rect.y && pos[1] <= rect.y + rect.h;
                    }
                    if (prevResetHover.some((v, i) => v !== this.customResetBtnHover[i])) this.setDirtyCanvas(true);
                }

                if (this.customDropdownRect) {
                    const prevDropdownHover = this.customDropdownHover;
                    this.customDropdownHover = pos[0] >= this.customDropdownRect.x && pos[0] <= this.customDropdownRect.x + this.customDropdownRect.w &&
                                                pos[1] >= this.customDropdownRect.y && pos[1] <= this.customDropdownRect.y + this.customDropdownRect.h;
                    if (prevDropdownHover !== this.customDropdownHover) this.setDirtyCanvas(true);
                }
            }

            if (!this.dragType || !this.isEditing || this.isLoading || !this.dragState) return;
            if (this.dragType === 'feather-center') return;
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
            }
            this.previewDirty = true; this.setDirtyCanvas(true);
        };

        nodeType.prototype.onMouseUp = function() {
            if (this.customSliderDragging >= 0) {
                this.customSliderDragging = -1;
                this.setDirtyCanvas(true);
            }
            if (this.dragType) {
                this.updateRelativeFromAbsolute();
                this._syncProperties();
                if (!this.advancedMode) {
                    this.computeAndApplyView();
                }
            }
            this.dragType = null; this.dragState = null;
        };
    }
});