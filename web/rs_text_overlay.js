import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RaykoTextOverlay",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RS_TextOverlay") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                this.data = {
                    text: "Текст",
                    font_name: "default",
                    text_color: "#FFFFFF",
                    outline_thickness: 0,
                    outline_color: "#808080",
                    rotate_with_mask: true,
                    text_opacity: 1.0,
                    line_spacing: 1.0,
                    letter_spacing: 0.0,
                    enable_shadow: false,
                    shadow_color: "#333333",
                    shadow_offset_x: 10,
                    shadow_offset_y: 10,
                    shadow_blur: 0.2,
                    shadow_opacity: 0.8,
                    enable_glow: false,
                    glow_color: "#FFFFFF",
                    glow_size: 150,
                    glow_spread: 250,
                    glow_brightness: 1.0,
                    font_list: ["default"],
                    use_supersampling: false,
                    use_edge_smoothing: true,
                    supersampling_factor: 2
                };
                
                this.rowHeight = 28;
                this.padding = 10;
                this.labelWidth = 120;
                this.targetWidth = 350;
                this.clickZones = [];
                this.widgetYPositions = {};
                
                this.hiddenWidget = this.widgets.find(w => w.name === "node_data");
                if (this.hiddenWidget) {
                    this.hiddenWidget.hidden = true;
                    this.hiddenWidget.serializeValue = () => {
                        this.syncData();
                        return this.hiddenWidget.value;
                    };
                    try {
                        const saved = JSON.parse(this.hiddenWidget.value);
                        if (saved && typeof saved === 'object') {
                            this.data = { ...this.data, ...saved };
                        }
                    } catch (e) {
                        console.error("Error loading saved data", e);
                    }
                }
                
                if (this.widgets) {
                    this.widgets.forEach(w => w.hidden = true);
                }
                
                this.setSize([this.targetWidth, 750]);
                const self = this;

                this.drawSeparator = function(ctx, text, x, y, w, h) {
                    ctx.fillStyle = "#444";
                    ctx.fillRect(x, y + 8, w, 1);
                    ctx.fillStyle = "#888";
                    ctx.font = "10px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(text, x + w/2, y + 22);
                };

                this.onDrawForeground = function(ctx, visibleRect) {
                    this.clickZones = [];
                    const startY = 80;
                    const rowH = this.rowHeight;
                    const pad = this.padding;
                    const labelW = this.labelWidth;
                    const arrowW = 25;
                    const inputW = this.size[0] - pad*2 - labelW;
                    let y = startY;

                    this.drawLabel(ctx, "TEXT", pad, y, labelW, rowH * 2);
                    this.drawMultilineField(ctx, this.data.text, pad + labelW, y, inputW, rowH * 2);
                    this.clickZones.push({ type: "text", x: pad + labelW, y: y, w: inputW, h: rowH * 2 });
                    this.widgetYPositions["text"] = y;
                    y += rowH * 2 + 5;

                    this.drawLabel(ctx, "FONT", pad, y, labelW, rowH);
                    this.drawComboField(ctx, this.data.font_name, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["font_name"] = y;
                    this.clickZones.push({ type: "combo", field: "font_name", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawLabel(ctx, "TEXT COLOR", pad, y, labelW, rowH);
                    this.drawColorField(ctx, this.data.text_color, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["text_color"] = y;
                    this.clickZones.push({ type: "color", field: "text_color", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawLabel(ctx, "OUTLINE THICK", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.outline_thickness, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["outline_thickness"] = y;
                    this.clickZones.push({ type: "number", field: "outline_thickness", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 0, max: 50 });
                    this.clickZones.push({ type: "arrow_left", field: "outline_thickness", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 0, max: 50, step: 1 });
                    this.clickZones.push({ type: "arrow_right", field: "outline_thickness", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 0, max: 50, step: 1 });
                    y += rowH + 5;

                    this.drawLabel(ctx, "OUTLINE COLOR", pad, y, labelW, rowH);
                    this.drawColorField(ctx, this.data.outline_color, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["outline_color"] = y;
                    this.clickZones.push({ type: "color", field: "outline_color", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawSeparator(ctx, "FORMATTING TEXT", pad, y, inputW + labelW, rowH);
                    y += rowH + 5;

                    this.drawLabel(ctx, "ROTATE WITH MASK", pad, y, labelW, rowH);
                    this.drawBooleanField(ctx, this.data.rotate_with_mask, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["rotate_with_mask"] = y;
                    this.clickZones.push({ type: "boolean", field: "rotate_with_mask", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawLabel(ctx, "TEXT OPACITY", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.text_opacity, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["text_opacity"] = y;
                    this.clickZones.push({ type: "number", field: "text_opacity", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 0, max: 1, float: true });
                    this.clickZones.push({ type: "arrow_left", field: "text_opacity", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 0, max: 1, step: 0.05, float: true });
                    this.clickZones.push({ type: "arrow_right", field: "text_opacity", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 0, max: 1, step: 0.05, float: true });
                    y += rowH + 5;

                    this.drawLabel(ctx, "LINE SPACING", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.line_spacing, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["line_spacing"] = y;
                    this.clickZones.push({ type: "number", field: "line_spacing", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 0.5, max: 3, float: true });
                    this.clickZones.push({ type: "arrow_left", field: "line_spacing", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 0.5, max: 3, step: 0.1, float: true });
                    this.clickZones.push({ type: "arrow_right", field: "line_spacing", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 0.5, max: 3, step: 0.1, float: true });
                    y += rowH + 5;

                    this.drawLabel(ctx, "LETTER SPACING", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.letter_spacing, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["letter_spacing"] = y;
                    this.clickZones.push({ type: "number", field: "letter_spacing", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: -20, max: 100, float: true });
                    this.clickZones.push({ type: "arrow_left", field: "letter_spacing", x: pad + labelW, y: y, w: arrowW, h: rowH, min: -20, max: 100, step: 0.5, float: true });
                    this.clickZones.push({ type: "arrow_right", field: "letter_spacing", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: -20, max: 100, step: 0.5, float: true });
                    y += rowH + 5;

                    this.drawSeparator(ctx, "GLOW SETTINGS", pad, y, inputW + labelW, rowH);
                    y += rowH + 5;

                    this.drawLabel(ctx, "ENABLE GLOW", pad, y, labelW, rowH);
                    this.drawBooleanField(ctx, this.data.enable_glow, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["enable_glow"] = y;
                    this.clickZones.push({ type: "boolean", field: "enable_glow", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawLabel(ctx, "GLOW COLOR", pad, y, labelW, rowH);
                    this.drawColorField(ctx, this.data.glow_color, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["glow_color"] = y;
                    this.clickZones.push({ type: "color", field: "glow_color", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawLabel(ctx, "GLOW SIZE", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.glow_size, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["glow_size"] = y;
                    this.clickZones.push({ type: "number", field: "glow_size", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 0, max: 500 });
                    this.clickZones.push({ type: "arrow_left", field: "glow_size", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 0, max: 500, step: 1 });
                    this.clickZones.push({ type: "arrow_right", field: "glow_size", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 0, max: 500, step: 1 });
                    y += rowH + 5;

                    this.drawLabel(ctx, "GLOW SPREAD", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.glow_spread, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["glow_spread"] = y;
                    this.clickZones.push({ type: "number", field: "glow_spread", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 0, max: 500 });
                    this.clickZones.push({ type: "arrow_left", field: "glow_spread", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 0, max: 500, step: 1 });
                    this.clickZones.push({ type: "arrow_right", field: "glow_spread", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 0, max: 500, step: 1 });
                    y += rowH + 5;

                    this.drawLabel(ctx, "GLOW BRIGHTNESS", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.glow_brightness, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["glow_brightness"] = y;
                    this.clickZones.push({ type: "number", field: "glow_brightness", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 0, max: 1, float: true });
                    this.clickZones.push({ type: "arrow_left", field: "glow_brightness", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 0, max: 1, step: 0.02, float: true });
                    this.clickZones.push({ type: "arrow_right", field: "glow_brightness", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 0, max: 1, step: 0.02, float: true });
                    y += rowH + 5;

                    this.drawSeparator(ctx, "SHADOW SETTINGS", pad, y, inputW + labelW, rowH);
                    y += rowH + 5;

                    this.drawLabel(ctx, "ENABLE SHADOW", pad, y, labelW, rowH);
                    this.drawBooleanField(ctx, this.data.enable_shadow, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["enable_shadow"] = y;
                    this.clickZones.push({ type: "boolean", field: "enable_shadow", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawLabel(ctx, "SHADOW COLOR", pad, y, labelW, rowH);
                    this.drawColorField(ctx, this.data.shadow_color, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["shadow_color"] = y;
                    this.clickZones.push({ type: "color", field: "shadow_color", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    this.drawLabel(ctx, "SHADOW OFFSET X", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.shadow_offset_x, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["shadow_offset_x"] = y;
                    this.clickZones.push({ type: "number", field: "shadow_offset_x", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: -500, max: 500 });
                    this.clickZones.push({ type: "arrow_left", field: "shadow_offset_x", x: pad + labelW, y: y, w: arrowW, h: rowH, min: -500, max: 500, step: 1 });
                    this.clickZones.push({ type: "arrow_right", field: "shadow_offset_x", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: -500, max: 500, step: 1 });
                    y += rowH + 5;

                    this.drawLabel(ctx, "SHADOW OFFSET Y", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.shadow_offset_y, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["shadow_offset_y"] = y;
                    this.clickZones.push({ type: "number", field: "shadow_offset_y", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: -500, max: 500 });
                    this.clickZones.push({ type: "arrow_left", field: "shadow_offset_y", x: pad + labelW, y: y, w: arrowW, h: rowH, min: -500, max: 500, step: 1 });
                    this.clickZones.push({ type: "arrow_right", field: "shadow_offset_y", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: -500, max: 500, step: 1 });
                    y += rowH + 5;

                    this.drawLabel(ctx, "SHADOW BLUR", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.shadow_blur, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["shadow_blur"] = y;
                    this.clickZones.push({ type: "number", field: "shadow_blur", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 0, max: 1, float: true });
                    this.clickZones.push({ type: "arrow_left", field: "shadow_blur", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 0, max: 1, step: 0.05, float: true });
                    this.clickZones.push({ type: "arrow_right", field: "shadow_blur", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 0, max: 1, step: 0.05, float: true });
                    y += rowH + 5;

                    this.drawLabel(ctx, "SHADOW BRIGHTNESS", pad, y, labelW, rowH);
                    this.drawNumberFieldWithArrows(ctx, this.data.shadow_opacity, pad + labelW, y, inputW, rowH, arrowW);
                    this.widgetYPositions["shadow_opacity"] = y;
                    this.clickZones.push({ type: "number", field: "shadow_opacity", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 0, max: 1, float: true });
                    this.clickZones.push({ type: "arrow_left", field: "shadow_opacity", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 0, max: 1, step: 0.05, float: true });
                    this.clickZones.push({ type: "arrow_right", field: "shadow_opacity", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 0, max: 1, step: 0.05, float: true });
                    y += rowH + 5;

                    this.drawSeparator(ctx, "QUALITY SETTINGS", pad, y, inputW + labelW, rowH);
                    y += rowH + 5;

                    this.drawLabel(ctx, "SUPERSAMPLING", pad, y, labelW, rowH);
                    this.drawBooleanField(ctx, this.data.use_supersampling, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["use_supersampling"] = y;
                    this.clickZones.push({ type: "boolean", field: "use_supersampling", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    if (this.data.use_supersampling) {
                        this.drawLabel(ctx, "SUPERSAMPLE FACTOR", pad, y, labelW, rowH);
                        this.drawNumberFieldWithArrows(ctx, this.data.supersampling_factor, pad + labelW, y, inputW, rowH, arrowW);
                        this.widgetYPositions["supersampling_factor"] = y;
                        this.clickZones.push({ type: "number", field: "supersampling_factor", x: pad + labelW + arrowW, y: y, w: inputW - arrowW*2, h: rowH, min: 2, max: 4 });
                        this.clickZones.push({ type: "arrow_left", field: "supersampling_factor", x: pad + labelW, y: y, w: arrowW, h: rowH, min: 2, max: 4, step: 1 });
                        this.clickZones.push({ type: "arrow_right", field: "supersampling_factor", x: pad + labelW + inputW - arrowW, y: y, w: arrowW, h: rowH, min: 2, max: 4, step: 1 });
                        y += rowH + 5;
                    }

                    this.drawLabel(ctx, "EDGE SMOOTHING", pad, y, labelW, rowH);
                    this.drawBooleanField(ctx, this.data.use_edge_smoothing, pad + labelW, y, inputW, rowH);
                    this.widgetYPositions["use_edge_smoothing"] = y;
                    this.clickZones.push({ type: "boolean", field: "use_edge_smoothing", x: pad + labelW, y: y, w: inputW, h: rowH });
                    y += rowH + 5;

                    const totalH = y + 10;
                    if (this.size[1] < totalH) {
                        this.setSize([this.targetWidth, totalH]);
                    }
                };

                this.onMouseDown = function(e, pos, canvas) {
                    if (!this.clickZones.length) return false;
                    for (const zone of this.clickZones) {
                        const inX = pos[0] >= zone.x && pos[0] <= zone.x + zone.w;
                        const inY = pos[1] >= zone.y && pos[1] <= zone.y + zone.h;
                        if (inX && inY) {
                            if (zone.type === "text") { self.showTextInput(e); return true; }
                            if (zone.type === "combo") { self.showComboSelector(zone.field, e); return true; }
                            if (zone.type === "color") { self.openColorPicker(zone.field, e); return true; }
                            if (zone.type === "boolean") { self.data[zone.field] = !self.data[zone.field]; self.updateUI(); return true; }
                            if (zone.type === "number") {
                                self.showInlineInput(zone.field, e, { isNumber: true, min: zone.min, max: zone.max, step: zone.step || 1, float: zone.float || false });
                                return true;
                            }
                            if (zone.type === "arrow_left") {
                                let current = self.data[zone.field];
                                current = zone.float ? current - zone.step : current - zone.step;
                                current = zone.float ? Math.round(current * 100) / 100 : current;
                                self.data[zone.field] = Math.max(zone.min, current);
                                self.updateUI();
                                return true;
                            }
                            if (zone.type === "arrow_right") {
                                let current = self.data[zone.field];
                                current = zone.float ? current + zone.step : current + zone.step;
                                current = zone.float ? Math.round(current * 100) / 100 : current;
                                self.data[zone.field] = Math.min(zone.max, current);
                                self.updateUI();
                                return true;
                            }
                        }
                    }
                    return false;
                };

                this.drawLabel = function(ctx, text, x, y, w, h) {
                    ctx.fillStyle = "#aaa"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
                    ctx.fillText(text, x, y + h/2 + 4);
                };
                this.drawMultilineField = function(ctx, value, x, y, w, h) {
                    ctx.fillStyle = "#222"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#444"; ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
                    if (!value || value.trim() === "") { ctx.fillStyle = "#666"; ctx.fillText("Enter text...", x + 5, y + h/2 + 4); return; }
                    const lines = value.split('\n'), lineHeight = 14, startY = y + 10, maxLines = 3;
                    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
                        let line = lines[i]; if (line.length > 35) line = line.substring(0, 32) + "...";
                        ctx.fillText(line, x + 5, startY + (i * lineHeight));
                    }
                    if (lines.length > maxLines) { ctx.fillStyle = "#666"; ctx.fillText("...", x + 5, startY + (maxLines * lineHeight)); }
                };
                this.drawComboField = function(ctx, value, x, y, w, h) {
                    ctx.fillStyle = "#222"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#444"; ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
                    ctx.fillText(value, x + w/2, y + h/2 + 4);
                    ctx.fillStyle = "#666"; ctx.beginPath(); ctx.moveTo(x + w - 12, y + h/2 - 3);
                    ctx.lineTo(x + w - 6, y + h/2 - 3); ctx.lineTo(x + w - 9, y + h/2 + 3); ctx.fill();
                };
                this.drawColorField = function(ctx, value, x, y, w, h) {
                    const hexW = w - 25; ctx.fillStyle = "#222"; ctx.fillRect(x, y, hexW, h);
                    ctx.strokeStyle = "#444"; ctx.strokeRect(x, y, hexW, h); ctx.fillStyle = "#fff";
                    ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.fillText(value, x + hexW/2, y + h/2 + 4);
                    const colorBoxX = x + hexW + 5, colorBoxY = y, colorBoxH = h;
                    ctx.fillStyle = value; ctx.fillRect(colorBoxX, colorBoxY, 20, colorBoxH);
                    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.strokeRect(colorBoxX, colorBoxY, 20, colorBoxH);
                };
                this.drawNumberFieldWithArrows = function(ctx, value, x, y, w, h, arrowW) {
                    ctx.fillStyle = "#222"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#444"; ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = "#4CAF50"; ctx.beginPath(); ctx.moveTo(x + 8, y + h/2);
                    ctx.lineTo(x + 16, y + h/2 - 6); ctx.lineTo(x + 16, y + h/2 + 6); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = "#4CAF50"; ctx.beginPath(); ctx.moveTo(x + w - 8, y + h/2);
                    ctx.lineTo(x + w - 16, y + h/2 - 6); ctx.lineTo(x + w - 16, y + h/2 + 6); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
                    const displayValue = typeof value === 'number' && value % 1 !== 0 ? value.toFixed(2) : value;
                    ctx.fillText(displayValue, x + w/2, y + h/2 + 4);
                };
                this.drawBooleanField = function(ctx, value, x, y, w, h) {
                    ctx.fillStyle = "#222"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#444"; ctx.strokeRect(x, y, w, h);
                    const circleX = x + w - 35, circleY = y + h/2;
                    ctx.fillStyle = value ? "#4CAF50" : "#555"; ctx.beginPath();
                    ctx.arc(circleX, circleY, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
                    ctx.fillText(value ? "ON" : "OFF", x + 8, y + h/2 + 4);
                };

                this.showComboSelector = function(fieldName, clickEvent) {
                    const options = { font_name: self.data.font_list || ["default"] };
                    let list = options[fieldName] || []; if (!list.length) return;
                    const menu = document.createElement("div");
                    menu.style.cssText = `position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:6px;max-height:300px;overflow-y:auto;z-index:10001;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:150px;`;
                    list.forEach(opt => {
                        const item = document.createElement("div"); item.textContent = opt;
                        item.style.cssText = `padding:10px 15px;cursor:pointer;color:#ddd;font-size:12px;border-bottom:1px solid #333;`;
                        item.onmouseover = () => item.style.background = "#333"; item.onmouseout = () => item.style.background = "#1a1a1a";
                        item.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); self.data[fieldName] = opt; self.updateUI(); menu.remove(); };
                        menu.appendChild(item);
                    });
                    if (clickEvent) { menu.style.left = (clickEvent.clientX + 8) + "px"; menu.style.top = clickEvent.clientY + "px"; }
                    else { menu.style.left = "250px"; menu.style.top = "200px"; }
                    document.body.appendChild(menu);
                    setTimeout(() => { const closeHandler = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("mousedown", closeHandler); } }; document.addEventListener("mousedown", closeHandler); }, 100);
                };
                this.showTextInput = function(clickEvent) {
                    const currentValue = self.data.text || '';
                    const popup = document.createElement('div');
                    popup.style.cssText = `position:fixed;z-index:10002;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:10px;box-shadow:0 4px 20px rgba(0,0,0,0.5);`;
                    const input = document.createElement('textarea'); input.value = currentValue;
                    input.style.cssText = `width:300px;height:150px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:10px;font-size:12px;resize:none;display:block;margin-bottom:10px;`;
                    const saveBtn = document.createElement('button'); saveBtn.textContent = 'SAVE';
                    saveBtn.style.cssText = `background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:8px 16px;font-size:14px;cursor:pointer;float:right;`;
                    saveBtn.onmouseover = () => saveBtn.style.background = "#45a049"; saveBtn.onmouseout = () => saveBtn.style.background = "#4CAF50";
                    popup.appendChild(input); popup.appendChild(saveBtn);
                    if (clickEvent) { popup.style.left = (clickEvent.clientX + 8) + 'px'; popup.style.top = clickEvent.clientY + 'px'; }
                    document.body.appendChild(popup);
                    setTimeout(() => { input.focus(); setTimeout(() => { if (currentValue && currentValue.length > 0) input.select(); }, 10); }, 50);
                    saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); self.data.text = input.value; self.updateUI(); popup.remove(); };
                    input.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.ctrlKey) { ev.preventDefault(); self.data.text = input.value; self.updateUI(); popup.remove(); } };
                };
                this.showInlineInput = function(fieldName, clickEvent, options = {}) {
                    const currentValue = self.data[fieldName] || '';
                    const isNumber = options.isNumber || false, min = options.min !== undefined ? options.min : null, max = options.max !== undefined ? options.max : null, isFloat = options.float || false;
                    const popup = document.createElement('div');
                    popup.style.cssText = `position:fixed;z-index:10003;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:8px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;white-space:nowrap;`;
                    const input = document.createElement('input'); input.type = isNumber ? 'number' : 'text'; input.value = currentValue;
                    if (isNumber) { input.step = options.step || 1; if (min !== null) input.min = min; if (max !== null) input.max = max; }
                    input.style.cssText = `width:100px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:12px;outline:none;`;
                    const saveBtn = document.createElement('button'); saveBtn.textContent = 'OK'; saveBtn.title = 'Save';
                    saveBtn.style.cssText = `background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;min-width:28px;`;
                    saveBtn.onmouseover = () => saveBtn.style.background = "#45a049"; saveBtn.onmouseout = () => saveBtn.style.background = "#4CAF50";
                    popup.appendChild(input); popup.appendChild(saveBtn);
                    if (clickEvent) { popup.style.left = (clickEvent.clientX + 8) + 'px'; popup.style.top = clickEvent.clientY + 'px'; }
                    document.body.appendChild(popup);
                    setTimeout(() => { input.focus(); setTimeout(() => { if (currentValue !== null && currentValue !== undefined && String(currentValue).length > 0) input.select(); }, 10); }, 50);
                    const doSave = () => { let value = input.value; if (isNumber) { let num = isFloat ? parseFloat(value) : parseInt(value); if (isNaN(num)) num = self.data[fieldName]; if (min !== null) num = Math.max(min, num); if (max !== null) num = Math.min(max, num); value = isFloat ? Math.round(num * 100) / 100 : num; } self.data[fieldName] = value; self.updateUI(); popup.remove(); };
                    saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); doSave(); };
                    input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doSave(); } };
                    setTimeout(() => { const closeHandler = (ev) => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener("mousedown", closeHandler); } }; document.addEventListener("mousedown", closeHandler); }, 50);
                    return popup;
                };
                this.openColorPicker = function(fieldName, clickEvent) {
                    const currentColor = self.data[fieldName] || '#FFFFFF';
                    const colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = currentColor; colorInput.style.display = 'none';
                    document.body.appendChild(colorInput);
                    colorInput.addEventListener('change', (e) => { const newColor = e.target.value.toUpperCase(); self.data[fieldName] = newColor; self.updateUI(); colorInput.remove(); }, { once: true });
                    setTimeout(() => { if (colorInput.showPicker) colorInput.showPicker(); else colorInput.click(); }, 10);
                };

                this.syncData = function() { if (this.hiddenWidget) { this.hiddenWidget.value = JSON.stringify(self.data, null, 2).replace(/\\u([0-9a-fA-F]{4})/g, function(match, p1) { return String.fromCharCode(parseInt(p1, 16)); }); } };
                this.updateUI = function() { self.syncData(); if (self.graph) self.graph.setDirtyCanvas(true, true); };
                const onSerialize = this.onSerialize; this.onSerialize = function(o) { self.syncData(); return onSerialize ? onSerialize.apply(this, arguments) : undefined; };
                const onExecute = this.onExecute; this.onExecute = function() { self.syncData(); return onExecute ? onExecute.apply(this, arguments) : undefined; };
                return result;
            };
        }
    }
});