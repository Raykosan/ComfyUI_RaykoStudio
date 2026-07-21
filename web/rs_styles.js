import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RaykoStylesLoader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Rayko_Styles_CSV_Loader") {
            console.log("[Rayko] RS Styles Loader JS loaded");
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                this.data = {
                    active_csv_file: "",
                    styles: [],
                    csv_list: [],
                    favorites: {}
                };
                
                this.rowHeight = 28;
                this.toolbarHeight = 28;
                this.padding = 10;
                this.labelWidth = 110;
                this.targetWidth = 340;
                this.targetHeight = 300;
                this.MIN_WIDTH = 340;
                this.MIN_HEIGHT = 340;
                
                this.clickZones = [];
                this.menuPosition = null;
                this.menuScrollPosition = 0;
                this.expandedFolders = {};
                
                this.manual_size = false;
                this.scrollOffset = 0;
                this.isAutoResizing = false;
                
                const self = this;
                
                this.hiddenWidget = this.widgets.find(w => w.name === "node_data");
                if (this.hiddenWidget) {
                    this.hiddenWidget.hidden = true;
                    this.hiddenWidget.tooltip = "";
                    this.hiddenWidget.type = "hidden";
                    
                    if (this.hiddenWidget.element) {
                        this.hiddenWidget.element.style.display = "none";
                        this.hiddenWidget.element.style.pointerEvents = "none";
                    }
                    
                    try {
                        const savedData = JSON.parse(this.hiddenWidget.value || "{}");
                        if (savedData && typeof savedData === 'object') {
                            this.data = { 
                                ...this.data, 
                                ...savedData,
                                csv_list: this.data.csv_list.length > 0 ? this.data.csv_list : savedData.csv_list || [],
                                favorites: savedData.favorites || {}
                            };
                            this.expandedFolders = savedData.expandedFolders || {};
                            this.manual_size = savedData.manual_size || false;
                            this.scrollOffset = savedData.scrollOffset || 0;
                        }
                    } catch (e) {
                        console.error("[Rayko] Error loading saved data", e);
                    }
                    
                    this.hiddenWidget.serializeValue = () => {
                        this.syncData();
                        return JSON.stringify(this.data);
                    };
                }
                
                if (this.widgets) {
                    this.widgets.forEach(w => {
                        if (w.name !== "node_data") {
                            w.hidden = true;
                        }
                    });
                }
                
                this.setSize([this.targetWidth, this.targetHeight]);

                this.syncData = function() {
                    if (this.hiddenWidget) {
                        this.hiddenWidget.value = JSON.stringify({
                            ...this.data,
                            expandedFolders: this.expandedFolders,
                            manual_size: this.manual_size,
                            scrollOffset: this.scrollOffset
                        });
                    }
                    if (this.graph) {
                        this.graph.changeTracker?.dispatchEvent(new Event("change"));
                    }
                };

                this.updateUI = function() {
                    this.syncData();
                    if (this.graph) { 
                        this.graph.setDirtyCanvas(true, true); 
                        this.graph.changeTracker?.dispatchEvent(new Event("change"));
                    }
                };

                this.wheelHandler = function(e) {
                    if (app.canvas.node_over !== self) {
                        return;
                    }

                    const graphPos = app.canvas.graph_mouse;
                    if (!graphPos) return;

                    const relY = graphPos[1] - self.pos[1];
                    
                    const startY = 80;
                    const rowH = self.rowHeight;
                    let y = startY;
                    y += rowH + 10;
                    y += rowH + 10;
                    y += rowH + 10;
                    y += rowH + 15;
                    y += rowH + 5;
                    y += self.toolbarHeight + 8;
                    
                    const availableHeight = self.size[1] - y - 10;
                    const maxVisibleStyles = Math.max(1, Math.floor(availableHeight / rowH));
                    const stylesEndY = y + maxVisibleStyles * rowH;
                    
                    if (relY < y || relY > stylesEndY) {
                        return;
                    }
                    
                    if (self.data.styles.length <= maxVisibleStyles) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    const delta = e.deltaY > 0 ? 1 : -1;
                    const maxOffset = self.data.styles.length - maxVisibleStyles;
                    const newOffset = Math.max(0, Math.min(self.scrollOffset + delta, maxOffset));
                    
                    if (newOffset !== self.scrollOffset) {
                        self.scrollOffset = newOffset;
                        self.syncData();
                        self.graph.setDirtyCanvas(true, true);
                    }
                };

                const initialCanvas = app.canvas.canvas;
                initialCanvas.addEventListener('wheel', this.wheelHandler, { capture: true, passive: false });

                this.visibilityHandler = function() {
                    if (!document.hidden) {
                        setTimeout(() => {
                            const currentCanvas = app.canvas.canvas;
                            
                            if (self.oldWheelCanvas && self.oldWheelCanvas !== currentCanvas) {
                                self.oldWheelCanvas.removeEventListener('wheel', self.oldWheelHandler, { capture: true, passive: false });
                                currentCanvas.addEventListener('wheel', self.wheelHandler, { capture: true, passive: false });
                                self.oldWheelCanvas = currentCanvas;
                            }
                            
                            if (self.graph) {
                                self.graph.setDirtyCanvas(true, true);
                            }
                            self.updateUI();
                        }, 150);
                    }
                };
                document.addEventListener("visibilitychange", this.visibilityHandler);

                this.loadCSVList = async function() {
                    try {
                        const response = await api.fetchApi("/rayko_get_csv_files");
                        if (response.ok) {
                            const files = await response.json();
                            self.data.csv_list = files.length > 0 ? files : ["No CSV files"];
                            if (!self.data.active_csv_file || self.data.active_csv_file === "No CSV files" || !self.data.csv_list.includes(self.data.active_csv_file)) {
                                self.data.active_csv_file = self.data.csv_list[0];
                            }
                            self.syncData();
                            self.graph?.setDirtyCanvas(true, true);
                        }
                    } catch (e) {
                        console.error("[Rayko] Error loading CSV list:", e);
                        self.data.csv_list = ["No CSV files"];
                    }
                };

                this.loadFavoritesFromServer = async function() {
                    try {
                        const response = await api.fetchApi("/rayko_get_favorites");
                        if (response.ok) {
                            const favorites = await response.json();
                            self.data.favorites = favorites;
                            return favorites;
                        }
                    } catch (e) {
                        console.error("[Rayko] Error loading favorites:", e);
                    }
                    return {};
                };

                this.saveFavoritesToServer = async function() {
                    try {
                        const response = await api.fetchApi("/rayko_save_favorites", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(self.data.favorites)
                        });
                        if (!response.ok) {
                            console.error("[Rayko] Error saving favorites:", await response.text());
                        }
                    } catch (e) {
                        console.error("[Rayko] Error saving favorites:", e);
                    }
                };

                this.migrateFavorites = async function() {
                    const serverFavorites = await self.loadFavoritesFromServer();
                    
                    const hasServerData = Object.keys(serverFavorites).length > 0;
                    const hasLocalData = self.data.favorites && Object.keys(self.data.favorites).length > 0;
                    
                    if (!hasServerData && hasLocalData) {
                        console.log("[Rayko] Migrating favorites from node_data to server");
                        await self.saveFavoritesToServer();
                    } else if (hasServerData) {
                        self.data.favorites = serverFavorites;
                    }
                };

                this.loadPresetsList = async function() {
                    try {
                        const response = await api.fetchApi("/rayko_get_presets");
                        if (response.ok) {
                            return await response.json();
                        }
                    } catch (e) {
                        console.error("[Rayko] Error loading presets:", e);
                    }
                    return [];
                };

                this.savePreset = async function(name) {
                    const presetData = {
                        csv_file: self.data.active_csv_file,
                        styles: self.data.styles
                    };
                    
                    try {
                        const response = await api.fetchApi("/rayko_save_preset", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name, ...presetData })
                        });
                        return response.ok;
                    } catch (e) {
                        console.error("[Rayko] Error saving preset:", e);
                        return false;
                    }
                };

                this.loadPreset = async function(name) {
                    try {
                        const response = await api.fetchApi("/rayko_load_preset", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name })
                        });
                        if (response.ok) {
                            const data = await response.json();
                            
                            requestAnimationFrame(() => {
                                if (data.csv_file) {
                                    self.data.active_csv_file = data.csv_file;
                                }
                                if (data.styles) {
                                    self.data.styles = data.styles;
                                }
                                self.scrollOffset = 0;
                                self.manual_size = false;
                                
                                const startY = 80;
                                const rowH = self.rowHeight;
                                let y = startY;
                                y += rowH + 10;
                                y += rowH + 10;
                                y += rowH + 10;
                                y += rowH + 15;
                                y += rowH + 5;
                                y += self.toolbarHeight + 8;
                                
                                const desiredVisible = Math.min(self.data.styles.length, 10);
                                const calculatedHeight = Math.max(self.MIN_HEIGHT, y + desiredVisible * rowH + 10);
                                
                                self.setSize([self.targetWidth, calculatedHeight]);
                                
                                if (self.graph) {
                                    self.graph.setDirtyCanvas(true, true);
                                }
                                
                                self.syncData();
                            });
                            
                            return true;
                        }
                    } catch (e) {
                        console.error("[Rayko] Error loading preset:", e);
                    }
                    return false;
                };

                this.deletePreset = async function(name) {
                    try {
                        const response = await api.fetchApi("/rayko_delete_preset", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name })
                        });
                        return response.ok;
                    } catch (e) {
                        console.error("[Rayko] Error deleting preset:", e);
                        return false;
                    }
                };

                this.drawSeparator = function(ctx, text, x, y, w, h) {
                    ctx.fillStyle = "#444";
                    ctx.fillRect(x, y + 8, w, 1);
                    ctx.fillStyle = "#888";
                    ctx.font = "10px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(text, x + w/2, y + 22);
                };

                this.drawLabel = function(ctx, text, x, y, w, h) {
                    ctx.fillStyle = "#aaa";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(text, x, y + h/2 + 4);
                };

                this.drawComboField = function(ctx, value, x, y, w, h) {
                    ctx.fillStyle = "#222";
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = "#444";
                    ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = "#fff";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "center";
                    
                    let displayValue = value || "No CSV files";
                    if (displayValue.length > 25) {
                        displayValue = displayValue.substring(0, 22) + "...";
                    }
                    ctx.fillText(displayValue, x + w/2, y + h/2 + 4);
                    
                    ctx.fillStyle = "#666";
                    ctx.beginPath();
                    ctx.moveTo(x + w - 12, y + h/2 - 3);
                    ctx.lineTo(x + w - 6, y + h/2 - 3);
                    ctx.lineTo(x + w - 9, y + h/2 + 3);
                    ctx.fill();
                };

                this.drawButton = function(ctx, text, x, y, w, h, iconColor = "#fff") {
                    ctx.fillStyle = "#242427";
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = "#3a3a3c";
                    ctx.strokeRect(x, y, w, h);
                    
                    ctx.font = "bold 11px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    
                    const parts = text.split(" ");
                    const icon = parts[0];
                    const label = parts.slice(1).join(" ");
                    
                    ctx.fillStyle = iconColor;
                    ctx.fillText(icon, x + w/2 - (label.length * 3.5), y + h/2);
                    
                    ctx.fillStyle = "#fff";
                    ctx.fillText(label, x + w/2 + 8, y + h/2);
                };

                this.drawRoundedRect = function(ctx, x, y, w, h, r) {
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
                };

                this.drawToolbarButton = function(ctx, text, icon, x, y, w, h, borderColor, isActive = true) {
                    const radius = 5;
                    ctx.fillStyle = "#242427";
                    this.drawRoundedRect(ctx, x, y, w, h, radius);
                    ctx.fill();
                    
                    ctx.strokeStyle = isActive ? borderColor : "#444";
                    ctx.lineWidth = 1;
                    this.drawRoundedRect(ctx, x, y, w, h, radius);
                    ctx.stroke();
                    
                    ctx.font = "bold 10px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    
                    const fullText = icon + " " + text;
                    ctx.fillStyle = isActive ? "#fff" : "#666";
                    ctx.fillText(fullText, x + w/2, y + h/2);
                };

                this.getStylesListStartY = function() {
                    const startY = 80;
                    const rowH = self.rowHeight;
                    let y = startY;
                    y += rowH + 10;
                    y += rowH + 10;
                    y += rowH + 10;
                    y += rowH + 15;
                    y += rowH + 5;
                    y += self.toolbarHeight + 8;
                    return y;
                };

                this.onDrawForeground = function(ctx, visibleRect) {
                    this.clickZones = [];
                    const startY = 80;
                    const rowH = self.rowHeight;
                    const pad = self.padding;
                    let y = startY;

                    self.drawLabel(ctx, "SELECT CSV FILE", pad, y, self.labelWidth, rowH);
                    self.drawComboField(ctx, self.data.active_csv_file, pad + self.labelWidth, y, self.size[0] - pad*2 - self.labelWidth, rowH);
                    this.clickZones.push({ type: "combo", field: "active_csv_file", x: pad + self.labelWidth, y: y, w: self.size[0] - pad*2 - self.labelWidth, h: rowH });
                    y += rowH + 10;

                    self.drawButton(ctx, "📂 UPLOAD NEW CSV FILE", pad, y, self.size[0] - pad*2, rowH, "#FF9800");
                    this.clickZones.push({ type: "upload", x: pad, y: y, w: self.size[0] - pad*2, h: rowH });
                    y += rowH + 10;

                    self.drawButton(ctx, "⭐ FAVORITES", pad, y, self.size[0] - pad*2, rowH, "#FFD700");
                    this.clickZones.push({ type: "favorites", x: pad, y: y, w: self.size[0] - pad*2, h: rowH });
                    y += rowH + 10;

                    self.drawButton(ctx, "➕ ADD STYLE", pad, y, self.size[0] - pad*2, rowH, "#9C27B0");
                    this.clickZones.push({ type: "add_style", x: pad, y: y, w: self.size[0] - pad*2, h: rowH });
                    y += rowH + 15;

                    self.drawSeparator(ctx, "ACTIVE STYLES", pad, y, self.size[0] - pad*2, rowH);
                    y += rowH + 5;

                    const toolbarY = y;
                    const toolbarH = self.toolbarHeight;
                    const availableWidth = self.size[0] - pad * 2;
                    
                    const baseClearW = 80;
                    const baseResetW = 80;
                    const baseSaveW = 75;
                    const baseLoadW = 75;
                    const gap = 6;
                    
                    const baseAvailableWidth = self.MIN_WIDTH - pad * 2;
                    const scale = Math.min(1.5, Math.max(1, availableWidth / baseAvailableWidth));
                    
                    const clearW = Math.floor(baseClearW * scale);
                    const resetW = Math.floor(baseResetW * scale);
                    const saveW = Math.floor(baseSaveW * scale);
                    const loadW = Math.floor(baseLoadW * scale);
                    
                    const totalW = clearW + resetW + saveW + loadW + gap * 3;
                    const startX = pad + (availableWidth - totalW) / 2;
                    
                    self.drawToolbarButton(ctx, "Clear All", "🔴", startX, toolbarY, clearW, toolbarH, "#f44336", self.data.styles.length > 0);
                    this.clickZones.push({ type: "clear_all", x: startX, y: toolbarY, w: clearW, h: toolbarH });
                    
                    const resetX = startX + clearW + gap;
                    self.drawToolbarButton(ctx, "Reset Size", "🔄", resetX, toolbarY, resetW, toolbarH, "#2196F3", self.manual_size);
                    this.clickZones.push({ type: "reset_size", x: resetX, y: toolbarY, w: resetW, h: toolbarH });
                    
                    const saveX = resetX + resetW + gap;
                    self.drawToolbarButton(ctx, "Save", "💾", saveX, toolbarY, saveW, toolbarH, "#4CAF50", true);
                    this.clickZones.push({ type: "save_preset", x: saveX, y: toolbarY, w: saveW, h: toolbarH });
                    
                    const loadX = saveX + saveW + gap;
                    self.drawToolbarButton(ctx, "Load", "📂", loadX, toolbarY, loadW, toolbarH, "#2196F3", true);
                    this.clickZones.push({ type: "load_preset", x: loadX, y: toolbarY, w: loadW, h: toolbarH });
                    
                    y += toolbarH + 8;

                    let maxVisibleStyles = Math.max(1, Math.floor((self.size[1] - y - 10) / rowH));

                    if (!self.manual_size) {
                        const desiredVisible = Math.min(self.data.styles.length, 10);
                        const calculatedHeight = Math.max(self.MIN_HEIGHT, y + desiredVisible * rowH + 10);
                        
                        if (Math.abs(self.size[1] - calculatedHeight) > 1) {
                            self.isAutoResizing = true;
                            self.setSize([self.targetWidth, calculatedHeight]);
                            self.isAutoResizing = false;
                        }
                        
                        const currentAvailableHeight = calculatedHeight - y - 10;
                        maxVisibleStyles = Math.max(1, Math.floor(currentAvailableHeight / rowH));
                    }

                    const maxOffset = Math.max(0, self.data.styles.length - maxVisibleStyles);
                    if (self.scrollOffset > maxOffset) {
                        self.scrollOffset = maxOffset;
                    }

                    const visibleStart = self.scrollOffset;
                    const visibleEnd = Math.min(visibleStart + maxVisibleStyles, self.data.styles.length);

                    const rightPanelWidth = 40;
                    const toggleStartX = 20;
                    const toggleRadius = 7;
                    const nameStartX = 42;
                    
                    for (let i = 0; i < visibleEnd - visibleStart; i++) {
                        const dataIdx = visibleStart + i;
                        const row = self.data.styles[dataIdx];
                        const styleY = y + (i * rowH);
                        const h = rowH - 2;
                        const centerY = styleY + h/2;

                        ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)";
                        ctx.fillRect(pad, styleY, self.size[0] - (pad * 2), h);

                        ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                        ctx.beginPath();
                        ctx.arc(toggleStartX, centerY, toggleRadius, 0, Math.PI * 2);
                        ctx.fill();
                        this.clickZones.push({ type: "toggle", index: dataIdx, x: toggleStartX - toggleRadius - 5, y: styleY, w: toggleRadius * 2 + 10, h: h });

                        const nameW = self.size[0] - nameStartX - rightPanelWidth - pad - 10;
                        
                        ctx.fillStyle = row.enabled ? "#fff" : "#777";
                        ctx.font = "12px sans-serif";
                        ctx.textAlign = "left";
                        ctx.textBaseline = "middle";
                        
                        let displayName = row.display_name || row.name;
                        if (displayName.includes("|")) {
                            const parts = displayName.split("|");
                            displayName = parts[parts.length - 1].trim();
                        }
                        
                        if (ctx.measureText(displayName).width > nameW) {
                            while (ctx.measureText(displayName + "...").width > nameW && displayName.length > 0) {
                                displayName = displayName.slice(0, -1);
                            }
                            displayName = displayName + "...";
                        }
                        
                        ctx.fillText(displayName, nameStartX, centerY);
                        this.clickZones.push({ type: "name", index: dataIdx, x: nameStartX, y: styleY, w: nameW, h: h });

                        const delX = self.size[0] - rightPanelWidth;
                        ctx.fillStyle = "#f44336";
                        ctx.fillText("❌", delX, centerY);
                        this.clickZones.push({ type: "delete", index: dataIdx, x: delX, y: styleY, w: 30, h: h });
                    }

                    if (self.data.styles.length > maxVisibleStyles) {
                        if (self.scrollOffset > 0) {
                            const indicatorY = y - 2;
                            ctx.fillStyle = "rgba(255, 215, 0, 0.6)";
                            ctx.beginPath();
                            ctx.moveTo(self.size[0]/2 - 8, indicatorY);
                            ctx.lineTo(self.size[0]/2 + 8, indicatorY);
                            ctx.lineTo(self.size[0]/2, indicatorY - 8);
                            ctx.closePath();
                            ctx.fill();
                        }
                        
                        if (visibleEnd < self.data.styles.length) {
                            const indicatorY = y + (visibleEnd - visibleStart) * rowH + 2;
                            ctx.fillStyle = "rgba(255, 215, 0, 0.6)";
                            ctx.beginPath();
                            ctx.moveTo(self.size[0]/2 - 8, indicatorY);
                            ctx.lineTo(self.size[0]/2 + 8, indicatorY);
                            ctx.lineTo(self.size[0]/2, indicatorY + 8);
                            ctx.closePath();
                            ctx.fill();
                        }
                    }
                };

                this.onMouseDown = function(e, pos, canvas) {
                    if (!this.clickZones.length) return false;
                    
                    for (const zone of this.clickZones) {
                        const inX = pos[0] >= zone.x && pos[0] <= zone.x + zone.w;
                        const inY = pos[1] >= zone.y && pos[1] <= zone.y + zone.h;
                        
                        if (inX && inY) {
                            if (zone.type === "combo" && zone.field === "active_csv_file") {
                                self.showCSVSelector(e);
                                return true;
                            }
                            if (zone.type === "upload") {
                                self.uploadCSVFile();
                                return true;
                            }
                            if (zone.type === "favorites") {
                                self.showFavoritesMenu(e);
                                return true;
                            }
                            if (zone.type === "add_style") {
                                self.showStyleSelector(e);
                                return true;
                            }
                            if (zone.type === "toggle") {
                                self.data.styles[zone.index].enabled = !self.data.styles[zone.index].enabled;
                                self.syncData();
                                self.graph.setDirtyCanvas(true, true);
                                self.graph.changeTracker?.dispatchEvent(new Event("change"));
                                return true;
                            }
                            if (zone.type === "delete") {
                                self.data.styles.splice(zone.index, 1);
                                self.scrollOffset = 0;
                                self.manual_size = false;
                                self.syncData();
                                
                                requestAnimationFrame(() => {
                                    const startY = 80;
                                    const rowH = self.rowHeight;
                                    let y = startY;
                                    y += rowH + 10;
                                    y += rowH + 10;
                                    y += rowH + 10;
                                    y += rowH + 15;
                                    y += rowH + 5;
                                    y += self.toolbarHeight + 8;
                                    
                                    const desiredVisible = Math.min(self.data.styles.length, 10);
                                    const calculatedHeight = Math.max(self.MIN_HEIGHT, y + desiredVisible * rowH + 10);
                                    
                                    self.setSize([self.targetWidth, calculatedHeight]);
                                    if (self.graph) {
                                        self.graph.setDirtyCanvas(true, true);
                                    }
                                });
                                
                                return true;
                            }
                            if (zone.type === "clear_all") {
                                if (self.data.styles.length === 0) return true;
                                self.data.styles = [];
                                self.scrollOffset = 0;
                                self.manual_size = false;
                                self.syncData();
                                
                                requestAnimationFrame(() => {
                                    self.setSize([self.targetWidth, self.MIN_HEIGHT]);
                                    if (self.graph) {
                                        self.graph.setDirtyCanvas(true, true);
                                    }
                                });
                                
                                return true;
                            }
                            if (zone.type === "reset_size") {
                                self.manual_size = false;
                                self.scrollOffset = 0;
                                self.syncData();
                                self.updateUI();
                                return true;
                            }
                            if (zone.type === "save_preset") {
                                self.showSavePresetDialog(e);
                                return true;
                            }
                            if (zone.type === "load_preset") {
                                self.showLoadPresetMenu(e);
                                return true;
                            }
                        }
                    }
                    return false;
                };

                const onResize = this.onResize;
                this.onResize = function(size) {
                    if (size[0] < self.MIN_WIDTH) size[0] = self.MIN_WIDTH;
                    if (size[1] < self.MIN_HEIGHT) size[1] = self.MIN_HEIGHT;

                    if (!self.isAutoResizing) {
                        self.manual_size = true;
                        self.syncData();
                    }
                    if (onResize) {
                        return onResize.apply(this, arguments);
                    }
                };

                this.showCSVSelector = function(clickEvent) {
                    const list = self.data.csv_list || [];
                    if (!list.length) return;
                    
                    const existingMenu = document.getElementById("rayko-csv-selector");
                    if (existingMenu) existingMenu.remove();
                    
                    const menu = document.createElement("div");
                    menu.id = "rayko-csv-selector";
                    menu.style.cssText = `position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:6px;max-height:300px;overflow-y:auto;z-index:10001;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:200px;`;
                    
                    list.forEach(opt => {
                        const item = document.createElement("div");
                        item.textContent = opt;
                        item.style.cssText = `padding:10px 15px;cursor:pointer;color:#ddd;font-size:12px;border-bottom:1px solid #333;background:${opt === self.data.active_csv_file ? '#333' : '#1a1a1a'};`;
                        item.onmouseover = () => item.style.background = "#444";
                        item.onmouseout = () => item.style.background = opt === self.data.active_csv_file ? '#333' : "#1a1a1a";
                        item.onclick = (ev) => {
                            ev.stopPropagation();
                            self.data.active_csv_file = opt;
                            self.syncData();
                            self.updateUI();
                            closeMenu();
                        };
                        menu.appendChild(item);
                    });
                    
                    if (clickEvent && clickEvent.clientX !== undefined) {
                        menu.style.left = (clickEvent.clientX + 8) + "px";
                        menu.style.top = clickEvent.clientY + "px";
                    }
                    
                    document.body.appendChild(menu);
                    
                    const closeMenu = () => {
                        menu.remove();
                        document.removeEventListener("pointerdown", closeOutside, true);
                        document.removeEventListener("keydown", closeEsc, true);
                    };
                    const closeOutside = (ev) => {
                        if (!menu.contains(ev.target)) closeMenu();
                    };
                    const closeEsc = (ev) => {
                        if (ev.key === "Escape") closeMenu();
                    };
                    
                    document.addEventListener("pointerdown", closeOutside, true);
                    document.addEventListener("keydown", closeEsc, true);
                };

                this.uploadCSVFile = async function() {
                    const fileInput = document.createElement("input");
                    fileInput.type = "file";
                    fileInput.accept = ".csv";
                    fileInput.style.display = "none";
                    
                    fileInput.addEventListener("change", async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            try {
                                const formData = new FormData();
                                formData.append("file", file);
                                const response = await api.fetchApi("/rayko_upload_csv_file", { method: "POST", body: formData });
                                
                                if (response.ok) {
                                    const data = await response.json();
                                    await self.loadCSVList();
                                    self.data.active_csv_file = data.filename;
                                    self.syncData();
                                    self.graph.setDirtyCanvas(true, true);
                                    self.graph.changeTracker?.dispatchEvent(new Event("change"));
                                } else {
                                    const errorText = await response.text();
                                    alert("Failed: " + errorText);
                                }
                            } catch (error) {
                                alert("Error: " + error.message);
                            }
                        }
                        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
                    });
                    
                    document.body.appendChild(fileInput);
                    fileInput.click();
                };

                this.toggleFavorite = async function(styleFullName, styleDisplayName) {
                    const file = self.data.active_csv_file;
                    if (!self.data.favorites[file]) {
                        self.data.favorites[file] = [];
                    }
                    const favs = self.data.favorites[file];
                    const idx = favs.findIndex(f => f.fullName === styleFullName);
                    
                    if (idx > -1) {
                        favs.splice(idx, 1);
                    } else {
                        favs.push({ fullName: styleFullName, displayName: styleDisplayName });
                    }
                    
                    await self.saveFavoritesToServer();
                };

                this.showFavoritesMenu = async function(clickEvent) {
                    await self.loadFavoritesFromServer();
                    
                    const file = self.data.active_csv_file;
                    const favs = self.data.favorites[file] || [];
                    
                    const existingMenu = document.getElementById("rayko-favorites-menu");
                    if (existingMenu) existingMenu.remove();
                    
                    const menu = document.createElement("div");
                    menu.id = "rayko-favorites-menu";
                    menu.style.cssText = `position:fixed;background:#1a1a1a;border:2px solid #FFD700;border-radius:6px;max-height:400px;overflow:hidden;z-index:10001;box-shadow:0 4px 20px rgba(255,215,0,0.3);min-width:250px;display:flex;flex-direction:column;`;
                    
                    const header = document.createElement("div");
                    header.textContent = `⭐ Favorites: ${file}`;
                    header.style.cssText = `padding:10px 12px;color:#fff;font-weight:bold;border-bottom:1px solid #333;background:#252525;flex-shrink:0;`;
                    menu.appendChild(header);

                    const contentContainer = document.createElement("div");
                    contentContainer.style.cssText = `overflow-y:auto;flex-grow:1;`;
                    menu.appendChild(contentContainer);

                    if (clickEvent && clickEvent.clientX !== undefined) {
                        menu.style.left = (clickEvent.clientX + 8) + "px";
                        menu.style.top = clickEvent.clientY + "px";
                    }

                    function isStyleAlreadyAdded(styleFullName) {
                        return self.data.styles.some(row => 
                            row.name === styleFullName && row.file === self.data.active_csv_file
                        );
                    }

                    function renderFavoritesContent() {
                        contentContainer.innerHTML = "";
                        
                        const currentFavs = self.data.favorites[file] || [];
                        
                        if (currentFavs.length === 0) {
                            const emptyMsg = document.createElement("div");
                            emptyMsg.textContent = "No favorites for this file yet.";
                            emptyMsg.style.cssText = `padding:15px;color:#888;font-size:12px;text-align:center;`;
                            contentContainer.appendChild(emptyMsg);
                            return;
                        }
                        
                        for (const fav of currentFavs) {
                            const isAdded = isStyleAlreadyAdded(fav.fullName);
                            
                            const item = document.createElement("div");
                            item.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;border-bottom:1px solid #333;font-size:13px;background:#1a1a1a;transition:background-color 0.15s;`;
                            item.onmouseover = () => item.style.backgroundColor = "#333";
                            item.onmouseout = () => item.style.backgroundColor = "#1a1a1a";
                            
                            const textSpan = document.createElement("span");
                            textSpan.textContent = (isAdded ? "✓ " : "🎨 ") + fav.displayName;
                            textSpan.style.cssText = `flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${isAdded ? '#4CAF50' : '#ddd'};`;
                            
                            const starSpan = document.createElement("span");
                            starSpan.textContent = "★";
                            starSpan.style.cssText = `color:#FFD700;font-size:16px;margin-left:10px;flex-shrink:0;cursor:pointer;`;
                            
                            starSpan.onclick = async (ev) => {
                                ev.stopPropagation();
                                await self.toggleFavorite(fav.fullName, fav.displayName);
                                renderFavoritesContent();
                            };
                            
                            item.onclick = (ev) => {
                                ev.stopPropagation();
                                self.addStyleRow(fav.fullName, fav.displayName);
                                renderFavoritesContent();
                            };
                            
                            item.appendChild(textSpan);
                            item.appendChild(starSpan);
                            contentContainer.appendChild(item);
                        }
                    }
                    
                    renderFavoritesContent();
                    
                    const closeMenu = () => {
                        menu.remove();
                        document.removeEventListener("keydown", closeEsc, true);
                        if (closeTimer) {
                            clearTimeout(closeTimer);
                            closeTimer = null;
                        }
                    };
                    
                    const closeEsc = (ev) => {
                        if (ev.key === "Escape") closeMenu();
                    };

                    let closeTimer = null;
                    const closeDelay = 300;
                    
                    menu.addEventListener("mouseleave", () => {
                        closeTimer = setTimeout(() => {
                            closeMenu();
                        }, closeDelay);
                    });
                    
                    menu.addEventListener("mouseenter", () => {
                        if (closeTimer) {
                            clearTimeout(closeTimer);
                            closeTimer = null;
                        }
                    });

                    setTimeout(() => {
                        const rect = menu.getBoundingClientRect();
                        if (rect.right > window.innerWidth) {
                            menu.style.left = (window.innerWidth - rect.width - 10) + "px";
                        }
                        if (rect.bottom > window.innerHeight) {
                            menu.style.top = (window.innerHeight - rect.height - 10) + "px";
                        }
                    }, 10);
                    
                    document.body.appendChild(menu);
                    document.addEventListener("keydown", closeEsc, true);
                };

                this.showStyleSelector = async function(clickEvent) {
                    if (!self.data.active_csv_file || self.data.active_csv_file === "No CSV files") {
                        alert("⚠️ Upload CSV first!");
                        return;
                    }
                    
                    try {
                        const response = await api.fetchApi("/rayko_get_styles_from_file", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ filename: self.data.active_csv_file })
                        });
                        
                        if (response.ok) {
                            const data = await response.json();
                            const allStyles = data.styles || [];
                            
                            if (allStyles.length === 0) {
                                alert("⚠️ No styles in CSV!");
                                return;
                            }
                            
                            const tree = { _folders: [], _styles: [] };
                            let currentFolder = null;
                            
                            for (const style of allStyles) {
                                if (!style) continue;
                                if (style.startsWith("|||")) {
                                    const folderName = style.replace("|||", "").trim();
                                    currentFolder = folderName;
                                    if (!tree[folderName]) {
                                        tree[folderName] = { _folders: [], _styles: [] };
                                        tree._folders.push(folderName);
                                    }
                                } else if (currentFolder && style.includes("|")) {
                                    const styleFullName = style.trim();
                                    const parts = styleFullName.split("|");
                                    const styleDisplayName = parts[parts.length - 1].trim();
                                    if (tree[currentFolder]) {
                                        tree[currentFolder]._styles.push({ fullName: styleFullName, displayName: styleDisplayName });
                                    }
                                } else {
                                    tree._styles.push({ fullName: style.trim(), displayName: style.trim() });
                                }
                            }
                            
                            self.menuPosition = {
                                left: (clickEvent.clientX + 8) + "px",
                                top: clickEvent.clientY + "px"
                            };
                            self.menuScrollPosition = 0;
                            self.expandedFolders = self.expandedFolders || {};
                            
                            self.showStyleTreeMenu(tree, self.expandedFolders, self.menuPosition);
                        }
                    } catch (e) {
                        alert("Error: " + e.message);
                    }
                };

                this.showStyleTreeMenu = function(tree, expandedFolders, fixedPosition) {
                    const currentScroll = self.menuScrollPosition || 0;
                    
                    const existingMenu = document.getElementById("rayko-style-menu");
                    if (existingMenu) existingMenu.remove();
                    
                    const menu = document.createElement("div");
                    menu.id = "rayko-style-menu";
                    menu.style.cssText = `position:fixed;background:#1a1a1a;border:2px solid #9C27B0;border-radius:6px;max-height:400px;overflow:hidden;z-index:10001;box-shadow:0 4px 20px rgba(156,39,176,0.3);min-width:250px;display:flex;flex-direction:column;`;
                    
                    const header = document.createElement("div");
                    header.textContent = `📁 ${self.data.active_csv_file}`;
                    header.style.cssText = `padding:10px 12px;color:#fff;font-weight:bold;border-bottom:1px solid #333;background:#252525;flex-shrink:0;`;
                    menu.appendChild(header);

                    const searchInput = document.createElement("input");
                    searchInput.type = "text";
                    searchInput.placeholder = " Search styles...";
                    searchInput.style.cssText = `width:calc(100% - 24px);margin:8px 12px;padding:8px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#fff;font-size:12px;outline:none;flex-shrink:0;`;
                    searchInput.autofocus = true;
                    menu.appendChild(searchInput);
                    
                    const contentContainer = document.createElement("div");
                    contentContainer.id = "rayko-style-content";
                    contentContainer.style.cssText = `overflow-y:auto;flex-grow:1;`;
                    menu.appendChild(contentContainer);
                    
                    let currentSearchQuery = "";

                    const closeMenu = () => {
                        self.menuPosition = null;
                        self.menuScrollPosition = 0;
                        menu.remove();
                        document.removeEventListener("keydown", closeEsc, true);
                        if (closeTimer) {
                            clearTimeout(closeTimer);
                            closeTimer = null;
                        }
                    };
                    
                    const closeEsc = (ev) => {
                        if (ev.key === "Escape") closeMenu();
                    };

                    let closeTimer = null;
                    const closeDelay = 300;
                    
                    menu.addEventListener("mouseleave", () => {
                        closeTimer = setTimeout(() => {
                            closeMenu();
                        }, closeDelay);
                    });
                    
                    menu.addEventListener("mouseenter", () => {
                        if (closeTimer) {
                            clearTimeout(closeTimer);
                            closeTimer = null;
                        }
                    });

                    searchInput.addEventListener("input", (e) => {
                        currentSearchQuery = e.target.value.toLowerCase();
                        renderContent();
                    });

                    function isStyleAlreadyAdded(styleFullName) {
                        return self.data.styles.some(row => 
                            row.name === styleFullName && row.file === self.data.active_csv_file
                        );
                    }

                    function renderStyleItem(container, styleFullName, styleDisplayName, displayText = null, indentLevel = 0) {
                        const isAdded = isStyleAlreadyAdded(styleFullName);
                        
                        const item = document.createElement("div");
                        item.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;border-bottom:1px solid #333;font-size:13px;background:#1a1a1a;transition:background-color 0.15s;`;
                        if (indentLevel > 0) {
                            item.style.paddingLeft = (12 + indentLevel * 16) + "px";
                        }
                        
                        const textSpan = document.createElement("span");
                        textSpan.textContent = (isAdded ? "✓ " : "🎨 ") + (displayText || styleDisplayName);
                        textSpan.style.cssText = `flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${isAdded ? '#4CAF50' : '#ddd'};`;
                        
                        const starSpan = document.createElement("span");
                        const fileFavs = self.data.favorites[self.data.active_csv_file] || [];
                        const isFav = fileFavs.some(f => f.fullName === styleFullName);
                        starSpan.textContent = isFav ? "★" : "☆";
                        starSpan.style.cssText = `color: ${isFav ? '#FFD700' : '#888'}; font-size: 16px; margin-left: 10px; flex-shrink: 0; cursor: pointer;`;
                        
                        starSpan.onclick = async (ev) => {
                            ev.stopPropagation();
                            await self.toggleFavorite(styleFullName, styleDisplayName);
                            renderContent();
                        };
                        
                        item.onclick = (ev) => {
                            ev.stopPropagation();
                            self.addStyleRow(styleFullName, styleDisplayName);
                            renderContent();
                        };
                        
                        item.onmouseover = () => item.style.backgroundColor = "#333";
                        item.onmouseout = () => item.style.backgroundColor = "#1a1a1a";
                        
                        item.appendChild(textSpan);
                        item.appendChild(starSpan);
                        container.appendChild(item);
                    }

                    function renderContent() {
                        contentContainer.innerHTML = "";
                        const query = currentSearchQuery;
                        
                        const matchesQuery = (displayName) => {
                            if (!query) return true;
                            return displayName.toLowerCase().includes(query);
                        };

                        if (query) {
                            const allMatchingStyles = [];
                            
                            function collectStyles(node, folderPrefix = "") {
                                if (node._styles) {
                                    for (const styleObj of node._styles) {
                                        if (matchesQuery(styleObj.displayName)) {
                                            allMatchingStyles.push({
                                                fullName: styleObj.fullName,
                                                displayName: styleObj.displayName,
                                                folderPath: folderPrefix ? `${folderPrefix} / ${styleObj.displayName}` : styleObj.displayName
                                            });
                                        }
                                    }
                                }
                                if (node._folders) {
                                    for (const folderName of node._folders) {
                                        collectStyles(node[folderName], folderPrefix ? `${folderPrefix} / ${folderName}` : folderName);
                                    }
                                }
                            }
                            
                            collectStyles(tree);

                            if (allMatchingStyles.length === 0) {
                                const noResult = document.createElement("div");
                                noResult.textContent = "No styles found";
                                noResult.style.cssText = `padding:10px 12px;color:#888;font-size:12px;text-align:center;`;
                                contentContainer.appendChild(noResult);
                                return;
                            }

                            for (const styleObj of allMatchingStyles) {
                                renderStyleItem(contentContainer, styleObj.fullName, styleObj.displayName, styleObj.folderPath);
                            }
                        } else {
                            if (tree._styles && tree._styles.length > 0) {
                                for (const styleObj of tree._styles) {
                                    renderStyleItem(contentContainer, styleObj.fullName, styleObj.displayName);
                                }
                                const separator = document.createElement("div");
                                separator.style.cssText = `height:1px;background:#333;margin:5px 0;`;
                                contentContainer.appendChild(separator);
                            }
                            
                            if (tree._folders && tree._folders.length > 0) {
                                for (const folderName of tree._folders) {
                                    renderFolderItem(folderName, tree[folderName], contentContainer, 0);
                                }
                            }
                        }
                    }
                    
                    function renderFolderItem(folderName, folderData, container, level) {
                        const folderPath = folderName;
                        const isExpanded = expandedFolders[folderPath] || false;
                        
                        const folderHeader = document.createElement("div");
                        folderHeader.style.cssText = `padding:10px 12px;cursor:pointer;color:#ffd700;font-weight:bold;border-bottom:1px solid #333;background:${level === 0 ? '#252525' : '#1f1f1f'};font-size:13px;padding-left:${12 + level * 16}px;`;
                        folderHeader.innerHTML = `<span style="margin-right:8px;">${isExpanded ? "▼" : "▶"}</span> 📁 ${folderName}`;
                        
                        folderHeader.onclick = (ev) => {
                            ev.stopPropagation();
                            const savedScroll = contentContainer.scrollTop;
                            expandedFolders[folderPath] = !isExpanded;
                            renderContent();
                            setTimeout(() => { contentContainer.scrollTop = savedScroll; }, 0);
                        };
                        
                        container.appendChild(folderHeader);
                        
                        if (isExpanded) {
                            if (folderData._styles && folderData._styles.length > 0) {
                                for (const styleObj of folderData._styles) {
                                    renderStyleItem(container, styleObj.fullName, styleObj.displayName, null, level + 1);
                                }
                            }
                            if (folderData._folders && folderData._folders.length > 0) {
                                for (const subFolderName of folderData._folders) {
                                    renderFolderItem(subFolderName, folderData[subFolderName], container, level + 1);
                                }
                            }
                        }
                    }
                    
                    renderContent();
                    
                    if (fixedPosition) {
                        menu.style.left = fixedPosition.left;
                        menu.style.top = fixedPosition.top;
                    }
                    
                    setTimeout(() => {
                        const rect = menu.getBoundingClientRect();
                        if (rect.right > window.innerWidth) {
                            menu.style.left = (window.innerWidth - rect.width - 10) + "px";
                        }
                        if (rect.bottom > window.innerHeight) {
                            menu.style.top = (window.innerHeight - rect.height - 10) + "px";
                        }
                        
                        if (currentScroll > 0) {
                            contentContainer.scrollTop = currentScroll;
                        }
                        searchInput.focus();
                    }, 10);
                    
                    document.body.appendChild(menu);
                    
                    contentContainer.addEventListener("scroll", () => {
                        self.menuScrollPosition = contentContainer.scrollTop;
                    });
                    
                    document.addEventListener("keydown", closeEsc, true);
                };

                this.showSavePresetDialog = function(e) {
                    const existingDialog = document.getElementById("rayko-save-preset-dialog");
                    if (existingDialog) existingDialog.remove();
                    
                    const dialog = document.createElement("div");
                    dialog.id = "rayko-save-preset-dialog";
                    dialog.style.cssText = `position:fixed;background:#2a2a2a;padding:10px;border:1px solid #4CAF50;border-radius:6px;z-index:10000;box-shadow:0 4px 15px rgba(0,0,0,0.7);width:220px;`;
                    
                    const label = document.createElement("div");
                    label.style.cssText = `color:#999;font-size:11px;margin-bottom:4px;`;
                    label.textContent = "Preset name:";
                    
                    const input = document.createElement("input");
                    input.style.cssText = `width:100%;padding:5px;background:#111;color:#fff;border:1px solid #444;border-radius:3px;margin-bottom:5px;font-size:12px;box-sizing:border-box;`;
                    
                    const btns = document.createElement("div");
                    btns.style.cssText = `display:flex;gap:5px;`;
                    
                    const okBtn = document.createElement("button");
                    okBtn.style.cssText = `flex:1;padding:4px;background:#1a3a1a;color:#aaffaa;border:1px solid #4CAF50;border-radius:3px;cursor:pointer;font-size:11px;`;
                    okBtn.textContent = "OK";
                    
                    const cancelBtn = document.createElement("button");
                    cancelBtn.style.cssText = `flex:1;padding:4px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:3px;cursor:pointer;font-size:11px;`;
                    cancelBtn.textContent = "Cancel";
                    
                    btns.appendChild(okBtn);
                    btns.appendChild(cancelBtn);
                    dialog.appendChild(label);
                    dialog.appendChild(input);
                    dialog.appendChild(btns);
                    
                    let finalX = 100, finalY = 100;
                    if (e && e.clientX !== undefined && e.clientY !== undefined) {
                        finalX = e.clientX + 10;
                        finalY = e.clientY + 10;
                    }
                    
                    if (finalX + 220 > window.innerWidth) finalX = window.innerWidth - 230;
                    if (finalY + 120 > window.innerHeight) finalY = window.innerHeight - 130;
                    if (finalX < 10) finalX = 10;
                    if (finalY < 10) finalY = 10;
                    
                    dialog.style.left = finalX + "px";
                    dialog.style.top = finalY + "px";
                    
                    document.body.appendChild(dialog);
                    setTimeout(() => input.focus(), 50);
                    
                    const performSave = async () => {
                        const name = input.value.trim();
                        if (!name) return;
                        dialog.remove();
                        document.removeEventListener("pointerdown", closeOutside, true);
                        
                        const success = await self.savePreset(name);
                        if (success) {
                            console.log(`[Rayko] Preset "${name}" saved`);
                        } else {
                            alert("Failed to save preset");
                        }
                    };
                    
                    okBtn.onclick = (ev) => {
                        ev.stopPropagation();
                        performSave();
                    };
                    cancelBtn.onclick = (ev) => {
                        ev.stopPropagation();
                        dialog.remove();
                        document.removeEventListener("pointerdown", closeOutside, true);
                    };
                    input.onkeydown = (ev) => {
                        if (ev.key === "Enter") performSave();
                        if (ev.key === "Escape") {
                            dialog.remove();
                            document.removeEventListener("pointerdown", closeOutside, true);
                        }
                    };
                    
                    const clickTime = Date.now();
                    const closeOutside = (ev) => {
                        if (Date.now() - clickTime < 300) return;
                        if (!dialog.contains(ev.target)) {
                            dialog.remove();
                            document.removeEventListener("pointerdown", closeOutside, true);
                        }
                    };
                    
                    setTimeout(() => {
                        document.addEventListener("pointerdown", closeOutside, true);
                    }, 50);
                };

                this.showLoadPresetMenu = async function(e) {
                    const existingMenu = document.getElementById("rayko-load-preset-menu");
                    if (existingMenu) existingMenu.remove();
                    
                    const menu = document.createElement("div");
                    menu.id = "rayko-load-preset-menu";
                    menu.style.cssText = `position:fixed;background:#1a1a1a;border:2px solid #2196F3;border-radius:6px;max-height:300px;overflow-y:auto;z-index:10001;box-shadow:0 4px 20px rgba(33,150,243,0.3);min-width:250px;`;
                    
                    menu.innerHTML = `<div style="padding:8px;color:#999;text-align:center;">Loading...</div>`;
                    
                    let finalX = 100, finalY = 100;
                    if (e && e.clientX !== undefined && e.clientY !== undefined) {
                        finalX = e.clientX + 10;
                        finalY = e.clientY + 10;
                    }
                    
                    if (finalX + 250 > window.innerWidth) finalX = window.innerWidth - 260;
                    if (finalY + 300 > window.innerHeight) finalY = window.innerHeight - 310;
                    if (finalX < 10) finalX = 10;
                    if (finalY < 10) finalY = 10;
                    
                    menu.style.left = finalX + "px";
                    menu.style.top = finalY + "px";
                    
                    document.body.appendChild(menu);
                    
                    const clickTime = Date.now();
                    const closeOutside = (ev) => {
                        if (Date.now() - clickTime < 300) return;
                        if (!menu.contains(ev.target)) {
                            menu.remove();
                            document.removeEventListener("pointerdown", closeOutside, true);
                        }
                    };
                    
                    setTimeout(() => {
                        document.addEventListener("pointerdown", closeOutside, true);
                    }, 50);
                    
                    try {
                        const presets = await self.loadPresetsList();
                        menu.innerHTML = "";
                        
                        if (presets.length === 0) {
                            menu.textContent = "No presets found";
                            return;
                        }
                        
                        presets.forEach(name => {
                            const row = document.createElement("div");
                            row.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #333;`;
                            
                            const nameSpan = document.createElement("span");
                            nameSpan.textContent = name;
                            nameSpan.style.cssText = `flex:1;cursor:pointer;color:#ccc;font-size:12px;`;
                            nameSpan.onmouseenter = () => nameSpan.style.background = "#3a3a3a";
                            nameSpan.onmouseleave = () => nameSpan.style.background = "transparent";
                            nameSpan.onclick = async (ev) => {
                                ev.stopPropagation();
                                menu.remove();
                                document.removeEventListener("pointerdown", closeOutside, true);
                                
                                const success = await self.loadPreset(name);
                                if (!success) {
                                    alert("Failed to load preset");
                                }
                            };
                            
                            const deleteBtn = document.createElement("span");
                            deleteBtn.textContent = "❌";
                            deleteBtn.style.cssText = `cursor:pointer;margin-left:8px;font-size:14px;opacity:0.7;`;
                            deleteBtn.onmouseenter = () => {
                                deleteBtn.style.opacity = "1";
                                deleteBtn.style.transform = "scale(1.2)";
                            };
                            deleteBtn.onmouseleave = () => {
                                deleteBtn.style.opacity = "0.7";
                                deleteBtn.style.transform = "scale(1)";
                            };
                            deleteBtn.onclick = async (ev) => {
                                ev.stopPropagation();
                                if (confirm(`Delete preset "${name}"?`)) {
                                    const success = await self.deletePreset(name);
                                    if (success) {
                                        menu.remove();
                                        document.removeEventListener("pointerdown", closeOutside, true);
                                        self.showLoadPresetMenu(e);
                                    } else {
                                        alert("Failed to delete preset");
                                    }
                                }
                            };
                            
                            row.appendChild(nameSpan);
                            row.appendChild(deleteBtn);
                            menu.appendChild(row);
                        });
                    } catch (err) {
                        menu.textContent = "Error loading presets";
                    }
                };

                this.addStyleRow = function(styleFullName, styleDisplayName) {
                    const exists = self.data.styles.some(row => row.name === styleFullName && row.file === self.data.active_csv_file);
                    if (exists) return;
                    
                    self.data.styles.push({ name: styleFullName, display_name: styleDisplayName, file: self.data.active_csv_file, enabled: true });
                    self.scrollOffset = 0;
                    self.manual_size = false;
                    self.syncData();
                    
                    requestAnimationFrame(() => {
                        const startY = 80;
                        const rowH = self.rowHeight;
                        let y = startY;
                        y += rowH + 10;
                        y += rowH + 10;
                        y += rowH + 10;
                        y += rowH + 15;
                        y += rowH + 5;
                        y += self.toolbarHeight + 8;
                        
                        const desiredVisible = Math.min(self.data.styles.length, 10);
                        const calculatedHeight = Math.max(self.MIN_HEIGHT, y + desiredVisible * rowH + 10);
                        
                        self.setSize([self.targetWidth, calculatedHeight]);
                        
                        if (self.graph) {
                            self.graph.setDirtyCanvas(true, true);
                            setTimeout(() => self.graph.setDirtyCanvas(true, true), 50);
                            setTimeout(() => self.graph.setDirtyCanvas(true, true), 100);
                            setTimeout(() => self.graph.setDirtyCanvas(true, true), 150);
                        }
                    });
                };

                const onSerialize = this.onSerialize;
                this.onSerialize = function(o) {
                    this.syncData();
                    if (onSerialize) {
                        return onSerialize.apply(this, arguments);
                    }
                };
                
                const onConfigure = this.onConfigure;
                this.onConfigure = function(o) {
                    if (onConfigure) {
                        onConfigure.apply(this, arguments);
                    }
                    if (this.hiddenWidget && this.hiddenWidget.value) {
                        try {
                            const restoredData = JSON.parse(this.hiddenWidget.value);
                            if (restoredData) {
                                this.data = { ...this.data, ...restoredData };
                                this.expandedFolders = restoredData.expandedFolders || {};
                                this.manual_size = restoredData.manual_size || false;
                                this.scrollOffset = restoredData.scrollOffset || 0;
                                if (!this.data.csv_list.length && restoredData.csv_list) {
                                    this.data.csv_list = restoredData.csv_list;
                                }
                                this.setSize([
                                    Math.max(this.size[0], this.MIN_WIDTH),
                                    Math.max(this.size[1], this.MIN_HEIGHT)
                                ]);
                                this.graph?.setDirtyCanvas(true, true);
                            }
                        } catch (e) {
                            console.error("[Rayko] Error restoring data:", e);
                        }
                    }
                };

                this.loadCSVList();
                this.migrateFavorites();
                
                return result;
            };
        }
    }
});