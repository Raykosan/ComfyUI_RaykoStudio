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
                
                // Initialize data
                this.data = {
                    active_csv_file: "",
                    styles: [],
                    csv_list: []
                };
                
                this.rowHeight = 28;
                this.padding = 10;
                this.labelWidth = 110;
                this.targetWidth = 340;
                this.clickZones = [];
                this.menuPosition = null;
                this.menuScrollPosition = 0;
                
                const self = this;
                
                // Find hidden widget
                this.hiddenWidget = this.widgets.find(w => w.name === "node_data");
                if (this.hiddenWidget) {
                    this.hiddenWidget.hidden = true;
                    this.hiddenWidget.tooltip = "";
                    this.hiddenWidget.type = "hidden";
                    
                    if (this.hiddenWidget.element) {
                        this.hiddenWidget.element.style.display = "none";
                        this.hiddenWidget.element.style.pointerEvents = "none";
                    }
                    
                    // CRITICAL FIX: Load data from widget value
                    try {
                        const savedData = JSON.parse(this.hiddenWidget.value || "{}");
                        if (savedData && typeof savedData === 'object') {
                            // Restore saved data, but keep csv_list if empty
                            this.data = { 
                                ...this.data, 
                                ...savedData,
                                // Ensure csv_list doesn't override with empty from save
                                csv_list: this.data.csv_list.length > 0 ? this.data.csv_list : savedData.csv_list || []
                            };
                        }
                    } catch (e) {
                        console.error("[Rayko] Error loading saved data", e);
                    }
                    
                    // Override serializeValue to always return current data
                    this.hiddenWidget.serializeValue = () => {
                        this.syncData();
                        return JSON.stringify(this.data);
                    };
                }
                
                // Hide all other widgets
                if (this.widgets) {
                    this.widgets.forEach(w => {
                        if (w.name !== "node_data") {
                            w.hidden = true;
                        }
                    });
                }
                
                this.setSize([this.targetWidth, 300]);

                // --- Core Data Loader ---
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

                // --- Helper Drawing Methods ---
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

                // --- Main Rendering ---
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

                    self.drawButton(ctx, "➕ ADD STYLE", pad, y, self.size[0] - pad*2, rowH, "#9C27B0");
                    this.clickZones.push({ type: "add_style", x: pad, y: y, w: self.size[0] - pad*2, h: rowH });
                    y += rowH + 15;

                    self.drawSeparator(ctx, "ACTIVE STYLES", pad, y, self.size[0] - pad*2, rowH);
                    y += rowH + 10;

                    const rightPanelWidth = 40;
                    const toggleStartX = 20;
                    const toggleRadius = 7;
                    const nameStartX = 42;
                    
                    for (let i = 0; i < self.data.styles.length; i++) {
                        const row = self.data.styles[i];
                        const styleY = y + (i * rowH);
                        const h = rowH - 2;
                        const centerY = styleY + h/2;

                        ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)";
                        ctx.fillRect(pad, styleY, self.size[0] - (pad * 2), h);

                        ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                        ctx.beginPath();
                        ctx.arc(toggleStartX, centerY, toggleRadius, 0, Math.PI * 2);
                        ctx.fill();
                        this.clickZones.push({ type: "toggle", index: i, x: toggleStartX - toggleRadius - 5, y: styleY, w: toggleRadius * 2 + 10, h: h });

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
                        this.clickZones.push({ type: "name", index: i, x: nameStartX, y: styleY, w: nameW, h: h });

                        const delX = self.size[0] - rightPanelWidth;
                        ctx.fillStyle = "#f44336";
                        ctx.fillText("❌", delX, centerY);
                        this.clickZones.push({ type: "delete", index: i, x: delX, y: styleY, w: 30, h: h });
                    }

                    const totalH = y + (self.data.styles.length * rowH) + 20;
                    if (self.size[1] < totalH) {
                        self.setSize([self.targetWidth, totalH]);
                    }
                };

                // --- Input Handling ---
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
                                self.syncData();
                                self.updateUI();
                                return true;
                            }
                        }
                    }
                    return false;
                };

                // --- Popup: CSV Selector ---
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
                    
                    if (clickEvent) {
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

                // --- Upload Logic ---
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

                // --- Style Selector Trigger ---
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
                            
                            self.showStyleTreeMenu(tree, {}, self.menuPosition);
                        }
                    } catch (e) {
                        alert("Error: " + e.message);
                    }
                };

                // --- Popup: Style Tree Menu ---
                this.showStyleTreeMenu = function(tree, expandedFolders, fixedPosition) {
                    const currentScroll = self.menuScrollPosition || 0;
                    
                    const existingMenu = document.getElementById("rayko-style-menu");
                    if (existingMenu) existingMenu.remove();
                    
                    const menu = document.createElement("div");
                    menu.id = "rayko-style-menu";
                    menu.style.cssText = `position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:6px;max-height:400px;overflow-y:auto;z-index:10001;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:250px;`;
                    
                    const header = document.createElement("div");
                    header.textContent = `📁 ${self.data.active_csv_file}`;
                    header.style.cssText = `padding:10px 12px;color:#fff;font-weight:bold;border-bottom:1px solid #333;background:#252525;position:sticky;top:0;`;
                    menu.appendChild(header);
                    
                    const contentContainer = document.createElement("div");
                    contentContainer.id = "rayko-style-content";
                    menu.appendChild(contentContainer);
                    
                    const closeMenu = () => {
                        self.menuPosition = null;
                        self.menuScrollPosition = 0;
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
                    
                    function renderContent() {
                        contentContainer.innerHTML = "";
                        
                        if (tree._styles && tree._styles.length > 0) {
                            for (const styleObj of tree._styles) {
                                const item = document.createElement("div");
                                item.textContent = "🎨 " + styleObj.displayName;
                                item.style.cssText = `padding:10px 12px;cursor:pointer;color:#ddd;border-bottom:1px solid #333;font-size:13px;`;
                                item.style.backgroundColor = "#1a1a1a";
                                item.onmouseover = () => item.style.backgroundColor = "#333";
                                item.onmouseout = () => item.style.backgroundColor = "#1a1a1a";
                                item.onclick = (ev) => { ev.stopPropagation(); self.addStyleRow(styleObj.fullName, styleObj.displayName); closeMenu(); };
                                contentContainer.appendChild(item);
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
                    
                    function renderFolderItem(folderName, folderData, container, level) {
                        const folderPath = folderName;
                        const isExpanded = expandedFolders[folderPath] || false;
                        
                        const folderHeader = document.createElement("div");
                        folderHeader.style.cssText = `padding:10px 12px;cursor:pointer;color:#ffd700;font-weight:bold;border-bottom:1px solid #333;background:${level === 0 ? '#252525' : '#1f1f1f'};font-size:13px;padding-left:${12 + level * 16}px;`;
                        folderHeader.innerHTML = `<span style="margin-right:8px;">${isExpanded ? "▼" : "▶"}</span> 📁 ${folderName}`;
                        
                        folderHeader.onclick = (ev) => {
                            ev.stopPropagation();
                            const savedScroll = menu.scrollTop;
                            expandedFolders[folderPath] = !isExpanded;
                            renderContent();
                            setTimeout(() => { menu.scrollTop = savedScroll; }, 0);
                        };
                        
                        container.appendChild(folderHeader);
                        
                        if (isExpanded) {
                            if (folderData._styles && folderData._styles.length > 0) {
                                for (const styleObj of folderData._styles) {
                                    const styleItem = document.createElement("div");
                                    styleItem.textContent = "🎨 " + styleObj.displayName;
                                    styleItem.style.cssText = `padding:10px 12px;cursor:pointer;color:#ddd;border-bottom:1px solid #333;font-size:13px;padding-left:${12 + (level + 1) * 16}px;`;
                                    styleItem.style.backgroundColor = "#1a1a1a";
                                    styleItem.onmouseover = () => styleItem.style.backgroundColor = "#333";
                                    styleItem.onmouseout = () => styleItem.style.backgroundColor = "#1a1a1a";
                                    styleItem.onclick = (ev) => { ev.stopPropagation(); self.addStyleRow(styleObj.fullName, styleObj.displayName); closeMenu(); };
                                    container.appendChild(styleItem);
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
                            menu.scrollTop = currentScroll;
                        }
                    }, 10);
                    
                    document.body.appendChild(menu);
                    
                    menu.addEventListener("scroll", () => {
                        self.menuScrollPosition = menu.scrollTop;
                    });
                    
                    document.addEventListener("pointerdown", closeOutside, true);
                    document.addEventListener("keydown", closeEsc, true);
                };

                // --- Core Logic ---
                this.addStyleRow = function(styleFullName, styleDisplayName) {
                    const exists = self.data.styles.some(row => row.name === styleFullName && row.file === self.data.active_csv_file);
                    if (exists) { alert("⚠️ Already added!"); return; }
                    
                    self.data.styles.push({ name: styleFullName, display_name: styleDisplayName, file: self.data.active_csv_file, enabled: true });
                    self.syncData();
                    self.updateUI();
                    self.menuPosition = null;
                    self.menuScrollPosition = 0;
                };

                this.syncData = function() {
                    if (this.hiddenWidget) {
                        this.hiddenWidget.value = JSON.stringify(this.data);
                    }
                    // Mark graph as changed to trigger auto-save
                    if (this.graph) {
                        this.graph.changeTracker?.dispatchEvent(new Event("change"));
                    }
                };

                this.updateUI = function() {
                    self.syncData();
                    if (self.graph) { 
                        self.graph.setDirtyCanvas(true, true); 
                        self.graph.changeTracker?.dispatchEvent(new Event("change"));
                    }
                };

                // CRITICAL: Override serialize method to ensure data is saved
                const onSerialize = this.onSerialize;
                this.onSerialize = function(o) {
                    self.syncData();
                    if (onSerialize) {
                        return onSerialize.apply(this, arguments);
                    }
                };
                
                // CRITICAL: Override onConfigure to restore data after load
                const onConfigure = this.onConfigure;
                this.onConfigure = function(o) {
                    if (onConfigure) {
                        onConfigure.apply(this, arguments);
                    }
                    // Restore data from widget after configuration
                    if (this.hiddenWidget && this.hiddenWidget.value) {
                        try {
                            const restoredData = JSON.parse(this.hiddenWidget.value);
                            if (restoredData) {
                                this.data = { ...this.data, ...restoredData };
                                // Don't lose csv_list if empty
                                if (!this.data.csv_list.length && restoredData.csv_list) {
                                    this.data.csv_list = restoredData.csv_list;
                                }
                                this.setSize([this.targetWidth, 300]);
                                this.graph?.setDirtyCanvas(true, true);
                            }
                        } catch (e) {
                            console.error("[Rayko] Error restoring data:", e);
                        }
                    }
                };

                // Load CSV list after everything is set up
                this.loadCSVList();
                
                return result;
            };
        }
    }
});