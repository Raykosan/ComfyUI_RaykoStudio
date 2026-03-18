import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RaykoLoraWidget",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RaykoModelsLoader") {
            console.log("[Rayko] JS загружен");
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                this.loraRows = [];
                this.loraOptions = [];
                this.loraTree = {};
                this.targetWidth = 450;
                this.rowHeight = 30;
                this.clickZones = [];
                
                this.hiddenWidget = this.widgets.find(w => w.name === "lora_data");
                if (this.hiddenWidget) {
                    this.hiddenWidget.hidden = true;
                    this.hiddenWidget.serializeValue = () => {
                        this.syncData();
                        return this.hiddenWidget.value;
                    };
                }

                this.setSize([this.targetWidth, this.size[1]]);

                this.addWidget("button", "🔄 Update the LoRA list", "", async () => {
                    await this.loadLoraList();
                    this.updateUI();
                });

                this.addWidget("button", "➕ Add LoRA", "", () => {
                    this.showLoraTreeSelector();
                });

                this.loadLoraList().then(() => {
                    if (this.hiddenWidget && this.hiddenWidget.value) {
                        try {
                            const saved = JSON.parse(this.hiddenWidget.value);
                            if (Array.isArray(saved)) this.loraRows = saved;
                        } catch (e) {}
                    }
                    this.updateUI();
                });

                return result;
            };

            nodeType.prototype.loadLoraList = async function() {
                try {
                    const response = await api.fetchApi("/rayko/get_loras");
                    const data = await response.json();
                    this.loraOptions = data.filter(l => l !== "None" && l !== null && l !== undefined);
                    this.loraTree = this.buildLoraTree(this.loraOptions);
                    console.log("[Rayko] LoRA найдено:", this.loraOptions.length);
                } catch (e) {
                    console.error("[Rayko] Ошибка:", e);
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
                        if (!current[part]) {
                            current[part] = isLast ? null : {};
                        }
                        if (!isLast) {
                            current = current[part];
                        }
                    }
                }
                return tree;
            };

            nodeType.prototype.onDrawForeground = function(ctx, visibleRect) {
                if (this.loraRows.length === 0) return;

                this.clickZones = [];
                const lastWidget = this.widgets[this.widgets.length - 1];
                const startY = lastWidget.y + lastWidget.height + 15;
                const padding = 10;

                // === ИСПРАВЛЕНО: Фиксированная ширина для правой панели управления ===
                const rightPanelWidth = 180; // Стрелки + поле + корзина
                const toggleWidth = 30;
                
                for (let i = 0; i < this.loraRows.length; i++) {
                    const row = this.loraRows[i];
                    const y = startY + (i * this.rowHeight);
                    const h = this.rowHeight - 2;

                    // Фон
                    ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)";
                    ctx.fillRect(padding, y, this.size[0] - (padding * 2), h);

                    // Переключатель
                    const toggleX = padding + 5;
                    const toggleY = y + h/2;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.arc(toggleX + 8, toggleY, 7, 0, Math.PI * 2);
                    ctx.fill();
                    this.clickZones.push({ type: "toggle", index: i, x: toggleX, y: y, w: 24, h: h });

                    // === ИСПРАВЛЕНО: Динамическая ширина названия ===
                    const nameX = toggleX + toggleWidth;
                    // Вычисляем доступную ширину: ширина ноды - отступы - правая панель
                    const nameW = this.size[0] - (padding * 2) - toggleWidth - rightPanelWidth - 20;
                    
                    ctx.fillStyle = row.enabled ? "#fff" : "#777";
                    ctx.font = "12px sans-serif";
                    
                    // Обрезаем название если не влезает
                    let displayName = row.name;
                    if (ctx.measureText(displayName).width > nameW) {
                        while (ctx.measureText(displayName + "...").width > nameW && displayName.length > 0) {
                            displayName = displayName.slice(0, -1);
                        }
                        displayName = displayName + "...";
                    }
                    
                    ctx.fillText(displayName, nameX, toggleY + 4);
                    this.clickZones.push({ type: "name", index: i, x: nameX, y: y, w: nameW, h: h });

                    // Стрелка влево
                    const arrowLX = this.size[0] - rightPanelWidth + 10;
                    const arrowW = 28;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.moveTo(arrowLX + 18, y + 8);
                    ctx.lineTo(arrowLX + 8, toggleY);
                    ctx.lineTo(arrowLX + 18, y + 22);
                    ctx.fill();
                    this.clickZones.push({ type: "left", index: i, x: arrowLX, y: y, w: arrowW, h: h });

                    // Поле ввода силы (МЕЖДУ стрелками)
                    const strInputX = arrowLX + arrowW + 5;
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

                    // Стрелка вправо
                    const arrowRX = strInputX + strInputW + 5;
                    ctx.fillStyle = row.enabled ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.moveTo(arrowRX + 10, y + 8);
                    ctx.lineTo(arrowRX + 20, toggleY);
                    ctx.lineTo(arrowRX + 10, y + 22);
                    ctx.fill();
                    this.clickZones.push({ type: "right", index: i, x: arrowRX, y: y, w: arrowW, h: h });

                    // Корзина
                    const delX = arrowRX + arrowW + 15;
                    const delW = 30;
                    ctx.fillStyle = "#f44336";
                    ctx.fillText("🗑️", delX, toggleY + 4);
                    this.clickZones.push({ type: "delete", index: i, x: delX, y: y, w: delW, h: h });
                }

                const totalH = startY + (this.loraRows.length * this.rowHeight) + 10;
                if (this.size[1] < totalH) this.setSize([this.targetWidth, totalH]);
            };

            nodeType.prototype.formatLoraName = function(name) {
                if (!name || name === "None") return "None";
                const parts = name.replace(/\\/g, "/").split("/");
                if (parts.length > 1) {
                    const folder = parts[parts.length - 2];
                    const file = parts[parts.length - 1];
                    return folder + "/" + file;
                }
                return name;
            };

            nodeType.prototype.onMouseDown = function(e, pos, canvas) {
                if (!this.clickZones || this.clickZones.length === 0) return false;
                
                for (const zone of this.clickZones) {
                    const inX = pos[0] >= zone.x && pos[0] <= zone.x + zone.w;
                    const inY = pos[1] >= zone.y && pos[1] <= zone.y + zone.h;
                    
                    if (inX && inY) {
                        if (zone.type === "toggle") {
                            this.loraRows[zone.index].enabled = !this.loraRows[zone.index].enabled;
                            this.syncData();
                            this.graph.setDirtyCanvas(true, true);
                            return true;
                        }
                        else if (zone.type === "strength_input") {
                            const currentValue = this.loraRows[zone.index].strength_model;
                            const newValue = prompt("Введите силу LoRA:", currentValue.toFixed(2));
                            if (newValue !== null) {
                                const parsed = parseFloat(newValue);
                                if (!isNaN(parsed) && parsed >= -10 && parsed <= 10) {
                                    this.loraRows[zone.index].strength_model = parsed;
                                    this.syncData();
                                    this.graph.setDirtyCanvas(true, true);
                                } else {
                                    alert("Пожалуйста, введите число от -10 до 10");
                                }
                            }
                            return true;
                        }
                        else if (zone.type === "left") {
                            this.loraRows[zone.index].strength_model = Math.max(-10, 
                                Math.round((this.loraRows[zone.index].strength_model - 0.05) * 20) / 20);
                            this.syncData();
                            this.graph.setDirtyCanvas(true, true);
                            return true;
                        }
                        else if (zone.type === "right") {
                            this.loraRows[zone.index].strength_model = Math.min(10, 
                                Math.round((this.loraRows[zone.index].strength_model + 0.05) * 20) / 20);
                            this.syncData();
                            this.graph.setDirtyCanvas(true, true);
                            return true;
                        }
                        else if (zone.type === "delete") {
                            this.loraRows.splice(zone.index, 1);
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
                const menu = document.createElement("div");
                menu.style.cssText = `
                    position: fixed; background: #1a1a1a; border: 1px solid #444;
                    border-radius: 6px; max-height: 500px; overflow-y: auto;
                    z-index: 10000; left: 200px; top: 200px;
                    min-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                `;

                const header = document.createElement("div");
                header.textContent = "📁 Выберите LoRA";
                header.style.cssText = `
                    padding: 10px 12px; color: #fff; font-weight: bold;
                    border-bottom: 1px solid #333; background: #252525;
                `;
                menu.appendChild(header);

                if (Object.keys(this.loraTree).length === 0) {
                    const emptyMsg = document.createElement("div");
                    emptyMsg.textContent = "⚠️ Список пуст";
                    emptyMsg.style.cssText = `padding: 20px; color: #f44336; text-align: center;`;
                    menu.appendChild(emptyMsg);
                } else {
                    const noneItem = document.createElement("div");
                    noneItem.textContent = "⭕ None";
                    noneItem.style.cssText = `
                        padding: 10px 12px; cursor: pointer; color: #888;
                        border-bottom: 1px solid #333;
                    `;
                    noneItem.onclick = (e) => {
                        e.stopPropagation();
                        self.addLoraRow("None");
                        menu.remove();
                    };
                    menu.appendChild(noneItem);
                    createTreeItems("", self.loraTree, 0, menu, expandedFolders, self, header, noneItem);
                }
                
                document.body.appendChild(menu);
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
                this.updateUI();
            };

            nodeType.prototype.updateUI = function() {
                this.syncData();
                if (this.graph) this.graph.setDirtyCanvas(true, true);
            };

            nodeType.prototype.syncData = function() {
                if (this.hiddenWidget) {
                    this.hiddenWidget.value = JSON.stringify(this.loraRows);
                    console.log("[Rayko] syncData:", this.hiddenWidget.value);
                }
            };

            const onExecute = this.onExecute;
            nodeType.prototype.onExecute = function() {
                this.syncData();
                return onExecute ? onExecute.apply(this, arguments) : undefined;
            };

            const onSerialize = this.onSerialize;
            nodeType.prototype.onSerialize = function(o) {
                this.syncData();
                return onSerialize ? onSerialize.apply(this, arguments) : undefined;
            };
        }
    }
});

function createTreeItems(path, tree, level, menu, expandedFolders, self, header, noneItem) {
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
            folderHeader.style.cssText = `
                padding: 8px 12px; cursor: pointer; color: #ffd700;
                font-size: 13px; background: #252525;
                display: flex; align-items: center;
            `;
            folderHeader.style.paddingLeft = (12 + level * 16) + "px";
            const isExpanded = expandedFolders[itemPath];
            folderHeader.innerHTML = `<span style="margin-right:8px;">${isExpanded ? "▼" : "▶"}</span> 📁 ${name}`;
            folderHeader.onclick = (e) => {
                e.stopPropagation();
                expandedFolders[itemPath] = !expandedFolders[itemPath];
                menu.innerHTML = "";
                menu.appendChild(header);
                menu.appendChild(noneItem);
                createTreeItems("", self.loraTree, 0, menu, expandedFolders, self, header, noneItem);
            };
            folderContainer.appendChild(folderHeader);
            menu.appendChild(folderContainer);
            if (expandedFolders[itemPath]) {
                createTreeItems(itemPath, subTree, level + 1, menu, expandedFolders, self, header, noneItem);
            }
        } else {
            const fileItem = document.createElement("div");
            fileItem.textContent = "📄 " + name;
            fileItem.style.cssText = `
                padding: 8px 12px; cursor: pointer; color: #ddd; font-size: 12px;
            `;
            fileItem.style.paddingLeft = (12 + level * 16) + "px";
            fileItem.onclick = (e) => {
                e.stopPropagation();
                self.addLoraRow(itemPath);
                if (menu.parentNode) menu.remove();
            };
            menu.appendChild(fileItem);
        }
    }
}