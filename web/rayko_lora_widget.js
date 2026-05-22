import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RaykoLoraWidget",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RaykoModelsLoader") {
            const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
            const originalOnConfigure = nodeType.prototype.onConfigure;
            const originalOnSerialize = nodeType.prototype.onSerialize;
            const originalOnRemoved = nodeType.prototype.onRemoved;
            
            nodeType.prototype.onNodeCreated = function() {
                const result = originalOnNodeCreated ? originalOnNodeCreated.apply(this, arguments) : undefined;
                this.loraRows = [];
                this.loraOptions = [];
                this.loraTree = {};
                this.targetWidth = 450;
                this.rowHeight = 30;
                this.clickZones = [];
                this.storageKey = null;
                this.isRestoring = false;
                this.isInitialized = false;
                
                this.hiddenWidget = this.widgets.find(w => w.name === "lora_data");
                const nodeRef = this;
                
                if (this.hiddenWidget) {
                    this.hiddenWidget.hidden = true;
                    const originalSerializeValue = this.hiddenWidget.serializeValue;
                    this.hiddenWidget.serializeValue = function() {
                        nodeRef.syncData();
                        const val = nodeRef.hiddenWidget ? nodeRef.hiddenWidget.value : "[]";
                        return (val !== undefined && val !== null) ? val : "[]";
                    };
                }

                // Find widgets for CLIP2 disabled logic
                const useClip2Widget = this.widgets.find(w => w.name === "use_clip2");
                const clipName2Widget = this.widgets.find(w => w.name === "clip_name2");
                
                if (useClip2Widget && clipName2Widget) {
                    // Set initial disabled state
                    clipName2Widget.disabled = !useClip2Widget.value;
                    
                    // Apply CSS class for visual styling
                    if (clipName2Widget.element) {
                        if (clipName2Widget.disabled) {
                            clipName2Widget.element.classList.add("comfy-disabled");
                        } else {
                            clipName2Widget.element.classList.remove("comfy-disabled");
                        }
                    }
                    
                    // Callback when use_clip2 changes
                    const originalCallback = useClip2Widget.callback;
                    useClip2Widget.callback = function(value) {
                        if (originalCallback) originalCallback(value);
                        clipName2Widget.disabled = !value;
                        if (clipName2Widget.element) {
                            if (clipName2Widget.disabled) {
                                clipName2Widget.element.classList.add("comfy-disabled");
                            } else {
                                clipName2Widget.element.classList.remove("comfy-disabled");
                            }
                        }
                        nodeRef.graph?.setDirtyCanvas(true, true);
                    };
                }

                this.setSize([this.targetWidth, this.size[1]]);

                this.addWidget("button", "✔️ Update LoRA list", "", async () => {
                    await this.loadLoraList();
                    if (this.graph) this.graph.setDirtyCanvas(true, true);
                });

                this.addWidget("button", "➕ Add LoRA", "", () => {
                    this.showLoraTreeSelector();
                });

                const self = this;
                setTimeout(() => {
                    if (this.id) {
                        this.storageKey = `rayko_lora_${this.id}`;
                        this.loadLoraList().then(() => {
                            this.restoreData();
                            this.isInitialized = true;
                            self.updateUI();
                        });
                    }
                }, 100);

                return result;
            };

            nodeType.prototype.onConfigure = function(info) {
                this.isRestoring = true;
                if (info.properties && info.properties["lora_rows"]) {
                    try {
                        const saved = JSON.parse(info.properties["lora_rows"]);
                        if (Array.isArray(saved)) this.loraRows = saved;
                    } catch (e) {}
                }
                if (info.widgets_values && Array.isArray(info.widgets_values)) {
                    for (let i = 0; i < info.widgets_values.length; i++) {
                        const val = info.widgets_values[i];
                        if (val && typeof val === "string" && val.startsWith("[")) {
                            try {
                                const saved = JSON.parse(val);
                                if (Array.isArray(saved) && saved.length > 0) {
                                    this.loraRows = saved;
                                    break;
                                }
                            } catch (e) {}
                        }
                    }
                }
                this.isRestoring = false;
                const self = this;
                this.loadLoraList().then(() => self.updateUI());
                
                // Restore disabled state of clip_name2 after configuration load
                const useClip2Widget = this.widgets.find(w => w.name === "use_clip2");
                const clipName2Widget = this.widgets.find(w => w.name === "clip_name2");
                if (useClip2Widget && clipName2Widget) {
                    clipName2Widget.disabled = !useClip2Widget.value;
                    if (clipName2Widget.element) {
                        if (clipName2Widget.disabled) {
                            clipName2Widget.element.classList.add("comfy-disabled");
                        } else {
                            clipName2Widget.element.classList.remove("comfy-disabled");
                        }
                    }
                }
                
                return originalOnConfigure ? originalOnConfigure.apply(this, arguments) : undefined;
            };

            nodeType.prototype.saveToStorage = function() {
                if (!this.storageKey) return;
                try {
                    localStorage.setItem(this.storageKey, JSON.stringify({
                        loraRows: this.loraRows,
                        timestamp: Date.now()
                    }));
                } catch (e) {}
            };

            nodeType.prototype.restoreFromStorage = function() {
                if (!this.storageKey) return null;
                try {
                    const stored = localStorage.getItem(this.storageKey);
                    if (stored) {
                        const data = JSON.parse(stored);
                        if (Date.now() - data.timestamp < 86400000 && Array.isArray(data.loraRows)) {
                            return data.loraRows;
                        }
                    }
                } catch (e) {}
                return null;
            };

            nodeType.prototype.restoreData = function() {
                if (this.isRestoring) return;
                let savedData = null;
                if (this.properties && this.properties["lora_rows"]) {
                    try {
                        savedData = JSON.parse(this.properties["lora_rows"]);
                        if (Array.isArray(savedData) && savedData.length > 0) {
                            this.loraRows = savedData;
                            return;
                        }
                    } catch (e) {}
                }
                if (!savedData && this.hiddenWidget && this.hiddenWidget.value) {
                    try {
                        const widgetVal = JSON.parse(this.hiddenWidget.value);
                        if (Array.isArray(widgetVal) && widgetVal.length > 0) {
                            this.loraRows = widgetVal;
                            return;
                        }
                    } catch (e) {}
                }
                if (!savedData) {
                    savedData = this.restoreFromStorage();
                    if (savedData) this.loraRows = savedData;
                }
            };

            nodeType.prototype.loadLoraList = async function() {
                try {
                    const response = await api.fetchApi("/rayko/get_loras");
                    const data = await response.json();
                    this.loraOptions = data.filter(l => l !== "None" && l !== null && l !== undefined);
                    this.loraTree = this.buildLoraTree(this.loraOptions);
                } catch (e) {
                    this.loraOptions = [];
                    this.loraTree = {};
                }
            };

            nodeType.prototype.buildLoraTree = function(loraList) {
                const tree = {};
                for (const lora of loraList) {
                    if (!lora || lora === "None") continue;
                    const normalizedPath = lora.replace(/\\/g, "/");
                    const parts = normalizedPath.split("/");
                    let current = tree;
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        const isLast = i === parts.length - 1;
                        if (!current[part]) current[part] = isLast ? null : {};
                        if (!isLast) current = current[part];
                    }
                }
                return tree;
            };

            nodeType.prototype.onDrawForeground = function(ctx, visibleRect) {
                if (this.loraRows.length === 0) return;
                this.clickZones = [];
                const visibleWidgets = this.widgets.filter(w => !w.hidden);
                const lastWidget = visibleWidgets.length > 0 ? visibleWidgets[visibleWidgets.length - 1] : null;
                const startY = lastWidget ? (lastWidget.y + lastWidget.height + 15) : 40;
                const padding = 10;
                const rightPanelWidth = 180;
                
                for (let i = 0; i < this.loraRows.length; i++) {
                    const row = this.loraRows[i];
                    const y = startY + (i * this.rowHeight);
                    const h = this.rowHeight - 2;

                    ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)";
                    ctx.fillRect(padding, y, this.size[0] - (padding * 2), h);

                    const toggleX = padding + 5;
                    const toggleY = y + h/2;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.arc(toggleX + 8, toggleY, 7, 0, Math.PI * 2);
                    ctx.fill();
                    this.clickZones.push({ type: "toggle", index: i, x: toggleX, y: y, w: 24, h: h });

                    const nameX = toggleX + 30;
                    const nameW = this.size[0] - (padding * 2) - 30 - rightPanelWidth - 20;
                    ctx.fillStyle = row.enabled ? "#fff" : "#777";
                    ctx.font = "12px sans-serif";
                    let displayName = row.name;
                    if (ctx.measureText(displayName).width > nameW) {
                        while (ctx.measureText(displayName + "...").width > nameW && displayName.length > 0) {
                            displayName = displayName.slice(0, -1);
                        }
                        displayName += "...";
                    }
                    ctx.fillText(displayName, nameX, toggleY + 4);
                    this.clickZones.push({ type: "name", index: i, x: nameX, y: y, w: nameW, h: h });

                    const arrowLX = this.size[0] - rightPanelWidth + 10;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.moveTo(arrowLX + 18, y + 8);
                    ctx.lineTo(arrowLX + 8, toggleY);
                    ctx.lineTo(arrowLX + 18, y + 22);
                    ctx.fill();
                    this.clickZones.push({ type: "left", index: i, x: arrowLX, y: y, w: 28, h: h });

                    const strInputX = arrowLX + 33;
                    const strInputW = 55;
                    ctx.fillStyle = "#222";
                    ctx.fillRect(strInputX, y + 5, strInputW, h - 10);
                    ctx.strokeStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.strokeRect(strInputX, y + 5, strInputW, h - 10);
                    ctx.fillStyle = row.enabled ? "#fff" : "#777";
                    ctx.textAlign = "center";
                    ctx.fillText(row.strength_model.toFixed(2), strInputX + strInputW/2, toggleY + 4);
                    ctx.textAlign = "left";
                    this.clickZones.push({ type: "strength_input", index: i, x: strInputX, y: y, w: strInputW, h: h });

                    const arrowRX = strInputX + strInputW + 5;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.moveTo(arrowRX + 10, y + 8);
                    ctx.lineTo(arrowRX + 20, toggleY);
                    ctx.lineTo(arrowRX + 10, y + 22);
                    ctx.fill();
                    this.clickZones.push({ type: "right", index: i, x: arrowRX, y: y, w: 28, h: h });

                    ctx.fillStyle = "#f44336";
                    ctx.fillText("❌️", arrowRX + 35, toggleY + 4);
                    this.clickZones.push({ type: "delete", index: i, x: arrowRX + 35, y: y, w: 30, h: h });
                }

                const totalH = startY + (this.loraRows.length * this.rowHeight) + 10;
                if (this.size[1] < totalH) {
                    this.setSize([this.targetWidth, totalH]);
                }
            };

            nodeType.prototype.onMouseDown = function(e, pos, canvas) {
                if (!this.clickZones || this.clickZones.length === 0) return false;
                for (const zone of this.clickZones) {
                    if (pos[0] >= zone.x && pos[0] <= zone.x + zone.w && pos[1] >= zone.y && pos[1] <= zone.y + zone.h) {
                        if (zone.type === "toggle") {
                            this.loraRows[zone.index].enabled = !this.loraRows[zone.index].enabled;
                            this.syncData();
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        } else if (zone.type === "strength_input") {
                            const newValue = prompt("Enter strength LoRA:", this.loraRows[zone.index].strength_model.toFixed(2));
                            if (newValue !== null) {
                                const parsed = parseFloat(newValue);
                                if (!isNaN(parsed) && parsed >= -10 && parsed <= 10) {
                                    this.loraRows[zone.index].strength_model = parsed;
                                    this.syncData();
                                    if (this.graph) this.graph.setDirtyCanvas(true, true);
                                }
                            }
                            return true;
                        } else if (zone.type === "left") {
                            this.loraRows[zone.index].strength_model = Math.max(-10, Math.round((this.loraRows[zone.index].strength_model - 0.05) * 20) / 20);
                            this.syncData();
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        } else if (zone.type === "right") {
                            this.loraRows[zone.index].strength_model = Math.min(10, Math.round((this.loraRows[zone.index].strength_model + 0.05) * 20) / 20);
                            this.syncData();
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        } else if (zone.type === "delete") {
                            this.loraRows.splice(zone.index, 1);
                            this.syncData();
                            this.updateUI();
                            return true;
                        }
                    }
                }
                return false;
            };

            nodeType.prototype.showLoraTreeSelector = function() {
                const self = this;
                const expandedFolders = {}; 
                let buttonElement = null;
                const widgets = this.widgets;
                for(let w of widgets) {
                    if(w.name === "➕ Add LoRA" && w.element) {
                        buttonElement = w.element;
                        break;
                    }
                }
                if (!buttonElement) {
                    const allButtons = document.querySelectorAll('button, div');
                    for (let el of allButtons) {
                        if (el.innerText && el.innerText.includes("Add LoRA")) {
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                buttonElement = el;
                                break;
                            }
                        }
                    }
                }

                let menuLeft, menuTop;
                const menuWidth = 450;
                const menuHeight = 600;

                if (buttonElement) {
                    const rect = buttonElement.getBoundingClientRect();
                    menuLeft = rect.right + 10; 
                    menuTop = rect.top; 
                } else {
                    menuLeft = (window.innerWidth / 2) - (menuWidth / 2);
                    menuTop = (window.innerHeight / 2) - (menuHeight / 2);
                }

                if (menuLeft + menuWidth > window.innerWidth) menuLeft = window.innerWidth - menuWidth - 10;
                if (menuTop + menuHeight > window.innerHeight) menuTop = window.innerHeight - menuHeight - 10;
                if (menuLeft < 10) menuLeft = 10;
                if (menuTop < 10) menuTop = 10;

                const menu = document.createElement("div");
                menu.style.cssText = `position: fixed; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; height: ${menuHeight}px; width: ${menuWidth}px; overflow-y: auto; overflow-x: hidden; z-index: 10000; left: ${menuLeft}px; top: ${menuTop}px; box-shadow: 0 4px 20px rgba(0,0,0,0.8); display: flex; flex-direction: column;`;

                const headerContainer = document.createElement("div");
                headerContainer.style.cssText = `padding: 10px; background: #252525; border-bottom: 1px solid #333; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;`;

                const title = document.createElement("div");
                title.textContent = " Search & Select LoRA";
                title.style.cssText = `color: #fff; font-weight: bold; font-size: 14px;`;
                
                const searchInput = document.createElement("input");
                searchInput.type = "text";
                searchInput.placeholder = "Type to search LoRA...";
                searchInput.style.cssText = `width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; outline: none; font-size: 13px; box-sizing: border-box;`;
                searchInput.autofocus = true;

                headerContainer.appendChild(title);
                headerContainer.appendChild(searchInput);
                menu.appendChild(headerContainer);

                const listContainer = document.createElement("div");
                listContainer.style.cssText = `padding: 5px 0; overflow-y: auto; flex-grow: 1;`;
                menu.appendChild(listContainer);

                const getAllPaths = (tree, currentPath = "") => {
                    let paths = [];
                    for (const name in tree) {
                        const subTree = tree[name];
                        const fullPath = currentPath ? `${currentPath}/${name}` : name;
                        const isFolder = subTree !== null;
                        paths.push({ path: fullPath, isFolder: isFolder });
                        if (isFolder) paths = paths.concat(getAllPaths(subTree, fullPath));
                    }
                    return paths;
                };

                const renderList = (filterText = "") => {
                    listContainer.innerHTML = "";
                    const lowerFilter = filterText.trim().toLowerCase();

                    if (!filterText || "none".includes(lowerFilter)) {
                        const noneItem = document.createElement("div");
                        noneItem.textContent = " None";
                        noneItem.style.cssText = `padding: 10px 12px; cursor: pointer; color: #aaa; border-bottom: 1px solid #333; background: #2a2a2a; font-style: italic;`;
                        noneItem.onmouseenter = () => noneItem.style.background = "#3a3a3a";
                        noneItem.onmouseleave = () => noneItem.style.background = "#2a2a2a";
                        noneItem.onclick = (e) => { e.stopPropagation(); self.addLoraRow("None"); menu.remove(); };
                        listContainer.appendChild(noneItem);
                    }

                    if (Object.keys(self.loraTree).length === 0) {
                        if (!filterText) {
                            const emptyMsg = document.createElement("div");
                            emptyMsg.textContent = " List is empty (Click Update LoRA list)";
                            emptyMsg.style.cssText = `padding: 20px; color: #f44336; text-align: center;`;
                            listContainer.appendChild(emptyMsg);
                        }
                        return;
                    }

                    if (lowerFilter.length > 0) {
                        const allPaths = getAllPaths(self.loraTree);
                        const matches = allPaths.filter(item => !item.isFolder && item.path.toLowerCase().includes(lowerFilter));
                        if (matches.length === 0) {
                            const noRes = document.createElement("div");
                            noRes.textContent = `No files found for "${filterText}"`;
                            noRes.style.cssText = "padding: 15px; color: #777; text-align: center; font-style: italic;";
                            listContainer.appendChild(noRes);
                        } else {
                            matches.forEach(item => {
                                const el = document.createElement("div");
                                el.textContent = ` ${item.path}`;
                                el.style.cssText = `padding: 8px 12px; cursor: pointer; color: #ddd; font-size: 12px; border-bottom: 1px solid #2a2a2a; background: transparent;`;
                                el.onmouseenter = () => el.style.background = "#333";
                                el.onmouseleave = () => el.style.background = "transparent";
                                el.onclick = (e) => { e.stopPropagation(); self.addLoraRow(item.path); menu.remove(); };
                                listContainer.appendChild(el);
                            });
                        }
                    } else {
                        listContainer.innerHTML = ""; 
                        createTreeItems("", self.loraTree, 0, listContainer, expandedFolders, self, null, null);
                    }
                };

                renderList("");

                let timeoutId = null;
                searchInput.addEventListener("input", (e) => {
                    if (timeoutId) clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => renderList(e.target.value), 50);
                });

                document.body.appendChild(menu);
                setTimeout(() => searchInput.focus(), 50);

                setTimeout(() => {
                    const closeHandler = (e) => {
                        if (!menu.contains(e.target)) {
                            menu.remove();
                            document.removeEventListener("click", closeHandler);
                        }
                    };
                    document.addEventListener("click", closeHandler);
                }, 100);
            };

            nodeType.prototype.addLoraRow = function(loraName) {
                this.loraRows.push({ name: loraName, strength_model: 1.0, strength_clip: 1.0, enabled: true });
                this.syncData();
                if (this.graph) {
                    const visibleWidgets = this.widgets.filter(w => !w.hidden);
                    const lastWidget = visibleWidgets.length > 0 ? visibleWidgets[visibleWidgets.length - 1] : null;
                    const startY = lastWidget ? (lastWidget.y + lastWidget.height + 15) : 40;
                    const newHeight = startY + (this.loraRows.length * this.rowHeight) + 10;
                    if (this.size[1] < newHeight) {
                        this.setSize([this.targetWidth, newHeight]);
                    }
                    this.graph.setDirtyCanvas(true, true);
                } else {
                    this.updateUI();
                }
            };

            nodeType.prototype.updateUI = function() {
                this.syncData();
                if (this.graph) this.graph.setDirtyCanvas(true, true);
            };

            nodeType.prototype.syncData = function() {
                if (this.isRestoring) return;
                const jsonData = JSON.stringify(this.loraRows);
                if (this.hiddenWidget) this.hiddenWidget.value = jsonData;
                if (!this.properties) this.properties = {};
                this.properties["lora_rows"] = jsonData;
                this.saveToStorage();
            };

            nodeType.prototype.onSerialize = function(o) {
                this.syncData();
                if (!o.properties) o.properties = {};
                o.properties["lora_rows"] = this.properties["lora_rows"];
                return originalOnSerialize ? originalOnSerialize.apply(this, arguments) : undefined;
            };

            nodeType.prototype.onRemoved = function() {
                if (this.storageKey) localStorage.removeItem(this.storageKey);
                return originalOnRemoved ? originalOnRemoved.apply(this, arguments) : undefined;
            };
        }
    }
});

document.addEventListener("visibilitychange", () => {
    if (!document.hidden && app && app.graph) {
        setTimeout(() => {
            app.graph._nodes.forEach(node => {
                if (node.type === "RaykoModelsLoader" && node.restoreData) {
                    node.restoreData();
                    node.updateUI();
                }
            });
        }, 200);
    }
});

window.addEventListener("focus", () => {
    if (app && app.graph) {
        setTimeout(() => {
            app.graph._nodes.forEach(node => {
                if (node.type === "RaykoModelsLoader" && node.restoreData) {
                    node.restoreData();
                    node.updateUI();
                }
            });
        }, 200);
    }
});

function createTreeItems(path, tree, level, container, expandedFolders, self, header, noneItem) {
    const sortedKeys = Object.keys(tree).sort((a, b) => {
        const aIsFolder = tree[a] !== null;
        const bIsFolder = tree[b] !== null;
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    for (const name of sortedKeys) {
        const subTree = tree[name];
        const isFolder = subTree !== null;
        const itemPath = path ? path + "/" + name : name;

        if (isFolder) {
            const folderContainer = document.createElement("div");
            const folderHeader = document.createElement("div");
            folderHeader.style.cssText = `padding: 8px 12px; cursor: pointer; color: #ffd700; font-size: 13px; background: #252525; display: flex; align-items: center;`;
            folderHeader.style.paddingLeft = (12 + level * 16) + "px";
            const isExpanded = expandedFolders[itemPath];
            folderHeader.innerHTML = `<span style="margin-right:8px;">${isExpanded ? "▼" : "▶"}</span> 📁 ${name}`;
            folderHeader.onclick = (e) => {
                e.stopPropagation();
                expandedFolders[itemPath] = !expandedFolders[itemPath];
                container.innerHTML = ""; 
                createTreeItems("", self.loraTree, 0, container, expandedFolders, self, header, noneItem);
            };
            folderContainer.appendChild(folderHeader);
            container.appendChild(folderContainer);
            if (expandedFolders[itemPath]) {
                createTreeItems(itemPath, subTree, level + 1, container, expandedFolders, self, header, noneItem);
            }
        } else {
            const fileItem = document.createElement("div");
            fileItem.textContent = " " + name;
            fileItem.style.cssText = `padding: 8px 12px; cursor: pointer; color: #ddd; font-size: 12px;`;
            fileItem.style.paddingLeft = (12 + level * 16) + "px";
            fileItem.onclick = (e) => {
                e.stopPropagation();
                self.addLoraRow(itemPath);
                let root = fileItem;
                while(root.parentNode && root.parentNode !== document.body) root = root.parentNode;
                if(root && root.parentNode === document.body) root.remove();
            };
            container.appendChild(fileItem);
        }
    }
}