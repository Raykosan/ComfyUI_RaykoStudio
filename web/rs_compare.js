import { app } from "../../scripts/app.js";

function drawImageFit(ctx, img, areaX, areaY, areaW, areaH, zoom, panX, panY) {
    if (!img || !img.complete || img.width === 0 || areaW <= 0 || areaH <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(areaX, areaY, areaW, areaH);
    ctx.clip();

    const scaleX = areaW / img.width;
    const scaleY = areaH / img.height;
    const scale = Math.min(scaleX, scaleY);

    const drawW = img.width * scale * zoom;
    const drawH = img.height * scale * zoom;
    const centerX = areaX + areaW / 2;
    const centerY = areaY + areaH / 2;
    const dx = centerX - (drawW / 2) + panX;
    const dy = centerY - (drawH / 2) + panY;

    ctx.drawImage(img, dx, dy, drawW, drawH);
    ctx.restore();
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function getImageArea(node) {
    const headerHeight = 50;
    const padding = 10;
    const yStart = headerHeight;
    const widgetsHeight = 112;
    const widgetsGap = 10;
    const yEnd = node.size[1] - widgetsHeight - widgetsGap - padding;
    const w = Math.max(10, node.size[0] - padding * 2);
    const h = Math.max(10, yEnd - yStart);
    return { padding, yStart, w, h };
}

function getWidgetsArea(node) {
    const padding = 10;
    const widgetsHeight = 112;
    const y = node.size[1] - widgetsHeight - padding;
    return { y, height: widgetsHeight };
}

function isPointInImageArea(node, localX, localY) {
    const { padding, yStart, w, h } = getImageArea(node);
    return localX >= padding && localX <= padding + w &&
           localY >= yStart && localY <= yStart + h;
}

app.registerExtension({
    name: "RS.ImageCompare",
    setup() {
        window.addEventListener('mouseup', () => {
            if (!app.graph || !app.graph._nodes) return;
            for (const node of app.graph._nodes) {
                if (node.type === 'RSComparer') {
                    if (node.rs_dragTarget || node.rs_isDragging) {
                        node.rs_dragTarget = null;
                        node.rs_isDragging = false;
                        app.graph.setDirtyCanvas(true, true);
                    }
                }
            }
        });
    },
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RSComparer") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.rs_img1 = null;
                this.rs_img2 = null;
                this.rs_sliderPos = 0.5;
                this.rs_isDragging = false;
                this.rs_hideImg2 = false;
                this.rs_dragTarget = null;
                this.rs_widgetRects = [];
                this.setSize([450, 450]);
                this.min_size = [450, 380];
                
                const hideWidget = (name) => {
                    const widget = this.widgets?.find(w => w.name === name);
                    if (widget) {
                        widget.hidden = true;
                        widget.computeSize = () => [0, 0];
                        widget.disabled = true;
                    }
                };
                hideWidget('zoom');
                hideWidget('pan_x');
                hideWidget('pan_y');
                
                return r;
            };

            const onResize = nodeType.prototype.onResize;
            nodeType.prototype.onResize = function (size) {
                size[0] = Math.max(450, size[0]);
                size[1] = Math.max(380, size[1]);
                return onResize ? onResize.apply(this, arguments) : undefined;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                const zoomWidget = this.widgets?.find(w => w.name === 'zoom');
                const panXWidget = this.widgets?.find(w => w.name === 'pan_x');
                const panYWidget = this.widgets?.find(w => w.name === 'pan_y');
                
                if (zoomWidget && panXWidget && panYWidget) {
                    zoomWidget.value = 1.0;
                    panXWidget.value = 0;
                    panYWidget.value = 0;
                }
                
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                
                const loadImage = (imgArray, imgProp) => {
                    if (imgArray && imgArray.length > 0) {
                        const imgData = imgArray[0];
                        const url = `/view?filename=${encodeURIComponent(imgData.filename)}&type=${imgData.type}&subfolder=${encodeURIComponent(imgData.subfolder)}&t=${Date.now()}`;
                        const img = new Image();
                        img.onload = () => {
                            this[imgProp] = img;
                            app.graph.setDirtyCanvas(true, true);
                        };
                        img.src = url;
                    } else {
                        this[imgProp] = null;
                    }
                };
                
                loadImage(message.image_1, "rs_img1");
                loadImage(message.image_2, "rs_img2");
                return r;
            };

            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function (ctx) {
                const r = onDrawForeground ? onDrawForeground.apply(this, arguments) : undefined;
                
                if ((this.flags && this.flags.collapsed) || (!this.rs_img1 && !this.rs_img2)) return r;
                
                const getVal = (name, def) => {
                    const w = this.widgets?.find(w => w.name === name);
                    return w !== undefined ? w.value : def;
                };

                const zoom = getVal('zoom', 1.0);
                const panPercentX = getVal('pan_x', 0);
                const panPercentY = getVal('pan_y', 0);
                
                const { padding, yStart, w, h } = getImageArea(this);
                const { y: widgetsY } = getWidgetsArea(this);
                
                let drawW = w;
                let drawH = h;
                if (this.rs_img2 && this.rs_img2.complete && this.rs_img2.width > 0) {
                    const scaleX = w / this.rs_img2.width;
                    const scaleY = h / this.rs_img2.height;
                    const scale = Math.min(scaleX, scaleY);
                    drawW = this.rs_img2.width * scale * zoom;
                    drawH = this.rs_img2.height * scale * zoom;
                }
                
                const panPixelX = (panPercentX / 100) * (drawW / 2);
                const panPixelY = (panPercentY / 100) * (drawH / 2);

                if (this.rs_img2) drawImageFit(ctx, this.rs_img2, padding, yStart, w, h, zoom, panPixelX, panPixelY);
                
                if (this.rs_img1 && !this.rs_hideImg2) {
                    ctx.save();
                    const clipW = w * this.rs_sliderPos;
                    ctx.beginPath();
                    ctx.rect(padding, yStart, clipW, h);
                    ctx.clip();
                    
                    drawImageFit(ctx, this.rs_img1, padding, yStart, w, h, zoom, panPixelX, panPixelY);
                    ctx.restore();
                    
                    ctx.beginPath();
                    ctx.moveTo(padding + clipW, yStart);
                    ctx.lineTo(padding + clipW, yStart + h);
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
                
                const ROW_HEIGHT = 24;
                const ROW_GAP = 4;
                const LABEL_WIDTH = 50;
                const INFO_WIDTH = 35;
                const RESET_WIDTH = 15;
                const CORNER_RADIUS = 6;
                const INNER_PADDING = 8;
                const SLIDER_HEIGHT = 4;
                const HANDLE_SIZE = 6;
                
                this.rs_widgetRects = [];
                
                const widgets = [
                    { name: 'zoom', icon: '🔎', label: 'Zoom', value: zoom, format: (v) => v.toFixed(1), default: 1.0, min: 1.0, max: 10.0, step: 0.05 },
                    { name: 'pan_x', icon: '↔️', label: 'Pan H', value: panPercentX, format: (v) => Math.round(v).toString(), default: 0, min: -100, max: 100, step: 0.5 },
                    { name: 'pan_y', icon: '️↕️', label: 'Pan V', value: panPercentY, format: (v) => Math.round(v).toString(), default: 0, min: -100, max: 100, step: 0.5 }
                ];
                
                const buttonWidth = w;
                const sliderWidth = buttonWidth - LABEL_WIDTH - INFO_WIDTH - RESET_WIDTH - 5 * INNER_PADDING;
                
                widgets.forEach((widget, i) => {
                    const rowY = widgetsY + i * (ROW_HEIGHT + ROW_GAP);
                    
                    const labelX = padding + INNER_PADDING;
                    const infoX = labelX + LABEL_WIDTH + INNER_PADDING;
                    const sliderX = infoX + INFO_WIDTH + INNER_PADDING;
                    const resetX = sliderX + sliderWidth + INNER_PADDING;
                    
                    drawRoundedRect(ctx, padding, rowY, buttonWidth, ROW_HEIGHT, CORNER_RADIUS);
                    ctx.fillStyle = "#252525";
                    ctx.fill();
                    ctx.strokeStyle = "#444444";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    ctx.font = "bold 12px Arial";
                    ctx.fillStyle = "#C0C0C0";
                    ctx.textAlign = "left";
                    ctx.textBaseline = "middle";
                    const labelText = `${widget.icon} ${widget.label}`;
                    ctx.fillText(labelText, labelX, rowY + ROW_HEIGHT / 2);
                    
                    const infoRect = { x: infoX, y: rowY + 2, w: INFO_WIDTH, h: ROW_HEIGHT - 4 };
                    drawRoundedRect(ctx, infoX, rowY + 2, INFO_WIDTH, ROW_HEIGHT - 4, 4);
                    ctx.fillStyle = "#3B3B3B";
                    ctx.fill();
                    
                    ctx.font = "12px monospace";
                    ctx.fillStyle = "#e0e0e0";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(widget.format(widget.value), infoX + INFO_WIDTH / 2, rowY + ROW_HEIGHT / 2);
                    
                    const sliderTrackY = rowY + ROW_HEIGHT / 2;
                    ctx.beginPath();
                    ctx.moveTo(sliderX, sliderTrackY);
                    ctx.lineTo(sliderX + sliderWidth, sliderTrackY);
                    ctx.strokeStyle = "#444444";
                    ctx.lineWidth = SLIDER_HEIGHT;
                    ctx.stroke();
                    
                    const normalizedValue = (widget.value - widget.min) / (widget.max - widget.min);
                    const handleX = sliderX + normalizedValue * sliderWidth;
                    
                    ctx.beginPath();
                    ctx.moveTo(handleX, sliderTrackY - HANDLE_SIZE);
                    ctx.lineTo(handleX + HANDLE_SIZE, sliderTrackY);
                    ctx.lineTo(handleX, sliderTrackY + HANDLE_SIZE);
                    ctx.lineTo(handleX - HANDLE_SIZE, sliderTrackY);
                    ctx.closePath();
                    ctx.fillStyle = "#000000";
                    ctx.fill();
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    const resetRect = { x: resetX, y: rowY, w: RESET_WIDTH, h: ROW_HEIGHT };
                    ctx.font = "12px Arial";
                    ctx.textAlign = "center";
                    ctx.fillText("🔃", resetX + RESET_WIDTH / 2, rowY + ROW_HEIGHT / 2);
                    
                    this.rs_widgetRects.push({
                        widget: widget.name,
                        sliderRect: { x: sliderX - HANDLE_SIZE, y: rowY - HANDLE_SIZE, w: sliderWidth + HANDLE_SIZE * 2, h: ROW_HEIGHT + HANDLE_SIZE * 2 },
                        sliderTrackX: sliderX,
                        sliderTrackWidth: sliderWidth,
                        infoRect,
                        resetRect,
                        default: widget.default,
                        min: widget.min,
                        max: widget.max,
                        step: widget.step
                    });
                });
                
                const resetAllY = widgetsY + 2 * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT + 6;
                const resetAllHeight = 22;
                
                drawRoundedRect(ctx, padding, resetAllY, buttonWidth, resetAllHeight, CORNER_RADIUS);
                ctx.fillStyle = "#252525";
                ctx.fill();
                ctx.strokeStyle = "#444444";
                ctx.lineWidth = 1;
                ctx.stroke();
                
                ctx.font = "bold 12px Arial";
                ctx.fillStyle = "#C0C0C0";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("🔄️ Reset All Parameters", padding + buttonWidth / 2, resetAllY + resetAllHeight / 2);
                
                this.rs_resetAllRect = { x: padding, y: resetAllY, w: buttonWidth, h: resetAllHeight };
                
                return r;
            };

            const onMouseDown = nodeType.prototype.onMouseDown;
            nodeType.prototype.onMouseDown = function (e, pos, graphcanvas) {
                for (let rect of this.rs_widgetRects) {
                    if (pos[0] >= rect.sliderRect.x && pos[0] <= rect.sliderRect.x + rect.sliderRect.w &&
                        pos[1] >= rect.sliderRect.y && pos[1] <= rect.sliderRect.y + rect.sliderRect.h) {
                        const widget = this.widgets?.find(w => w.name === rect.widget);
                        if (widget) {
                            const clickPos = pos[0] - rect.sliderTrackX;
                            const normalizedClick = Math.max(0, Math.min(1, clickPos / rect.sliderTrackWidth));
                            let clickValue = rect.min + normalizedClick * (rect.max - rect.min);
                            
                            if (rect.widget === 'zoom') {
                                clickValue = Math.round(clickValue * 10) / 10;
                            } else {
                                clickValue = Math.round(clickValue);
                            }
                            
                            widget.value = clickValue;
                            
                            this.rs_dragTarget = {
                                widget: rect.widget,
                                startX: pos[0],
                                startValue: clickValue,
                                sliderX: rect.sliderTrackX,
                                sliderWidth: rect.sliderTrackWidth,
                                min: rect.min,
                                max: rect.max,
                                step: rect.step
                            };
                            graphcanvas.setDirty(true, true);
                            e.stopPropagation();
                            e.preventDefault();
                            return true;
                        }
                    }
                    
                    if (pos[0] >= rect.resetRect.x && pos[0] <= rect.resetRect.x + rect.resetRect.w &&
                        pos[1] >= rect.resetRect.y && pos[1] <= rect.resetRect.y + rect.resetRect.h) {
                        const widget = this.widgets?.find(w => w.name === rect.widget);
                        if (widget) {
                            widget.value = rect.default;
                            graphcanvas.setDirty(true, true);
                            e.stopPropagation();
                            e.preventDefault();
                            return true;
                        }
                    }
                }
                
                if (this.rs_resetAllRect && pos[0] >= this.rs_resetAllRect.x && pos[0] <= this.rs_resetAllRect.x + this.rs_resetAllRect.w &&
                    pos[1] >= this.rs_resetAllRect.y && pos[1] <= this.rs_resetAllRect.y + this.rs_resetAllRect.h) {
                    const zoomWidget = this.widgets?.find(w => w.name === 'zoom');
                    const panXWidget = this.widgets?.find(w => w.name === 'pan_x');
                    const panYWidget = this.widgets?.find(w => w.name === 'pan_y');
                    
                    if (zoomWidget && panXWidget && panYWidget) {
                        zoomWidget.value = 1.0;
                        panXWidget.value = 0;
                        panYWidget.value = 0;
                        graphcanvas.setDirty(true, true);
                        e.stopPropagation();
                        e.preventDefault();
                        return true;
                    }
                }
                
                if (isPointInImageArea(this, pos[0], pos[1])) {
                    this.rs_isDragging = true;
                    const { padding, w } = getImageArea(this);
                    this.rs_sliderPos = Math.max(0, Math.min(1, (pos[0] - padding) / w));
                    graphcanvas.setDirty(true, true);
                    e.stopPropagation();
                    e.preventDefault();
                    return true;
                }
                return onMouseDown ? onMouseDown.apply(this, arguments) : false;
            };

            const onMouseMove = nodeType.prototype.onMouseMove;
            nodeType.prototype.onMouseMove = function (e, pos, graphcanvas) {
                if (this.rs_dragTarget) {
                    const delta = pos[0] - this.rs_dragTarget.startX;
                    const deltaValue = (delta / this.rs_dragTarget.sliderWidth) * (this.rs_dragTarget.max - this.rs_dragTarget.min);
                    let newValue = this.rs_dragTarget.startValue + deltaValue;
                    newValue = Math.max(this.rs_dragTarget.min, Math.min(this.rs_dragTarget.max, newValue));
                    
                    if (this.rs_dragTarget.widget === 'zoom') {
                        newValue = Math.round(newValue * 10) / 10;
                    } else {
                        newValue = Math.round(newValue);
                    }
                    
                    const widget = this.widgets?.find(w => w.name === this.rs_dragTarget.widget);
                    if (widget) {
                        widget.value = newValue;
                        graphcanvas.setDirty(true, true);
                    }
                    e.stopPropagation();
                    e.preventDefault();
                    return true;
                }
                
                if (this.rs_isDragging) {
                    const { padding, w } = getImageArea(this);
                    this.rs_sliderPos = Math.max(0, Math.min(1, (pos[0] - padding) / w));
                    graphcanvas.setDirty(true, true);
                    e.stopPropagation();
                    e.preventDefault();
                    return true;
                }
                return onMouseMove ? onMouseMove.apply(this, arguments) : false;
            };

            const onMouseUp = nodeType.prototype.onMouseUp;
            nodeType.prototype.onMouseUp = function (e, pos, graphcanvas) {
                if (this.rs_dragTarget || this.rs_isDragging) {
                    e.stopPropagation();
                    e.preventDefault();
                }
                this.rs_dragTarget = null;
                this.rs_isDragging = false;
                return onMouseUp ? onMouseUp.apply(this, arguments) : false;
            };

            const onKeyDown = nodeType.prototype.onKeyDown;
            nodeType.prototype.onKeyDown = function (e, pos, graphcanvas) {
                if (e.code === 'Space') {
                    this.rs_hideImg2 = !this.rs_hideImg2;
                    graphcanvas.setDirty(true, true);
                    e.stopPropagation();
                    e.preventDefault();
                    return true;
                }
                return onKeyDown ? onKeyDown.apply(this, arguments) : false;
            };
        }
    }
});