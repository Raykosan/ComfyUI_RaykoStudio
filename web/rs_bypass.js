import { app } from "../../scripts/app.js";

function isNodeInGroup(node, group) {
    if (!node || !group) return false;
    
    const n = node.getBounding ? node.getBounding() : node._bounding;
    const g = group.bounding || group._bounding;
    
    if (!n || !g) return false;
    
    return n[0] < g[0] + g[2] && n[0] + n[2] > g[0] &&
           n[1] < g[1] + g[3] && n[1] + n[3] > g[1];
}

function setNodeBypass(targetNode, bypass) {
    targetNode.mode = bypass ? 4 : 0;
    targetNode.setDirtyCanvas(true, true);
}

app.registerExtension({
    name: "RS.Bypass",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RS_Bypass") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const self = this;
                
                // Новая структура данных: храним объекты { id, enabled }
                self.data = {
                    bypassedNodes: [],   // массив { id, enabled }
                    bypassedGroups: [],  // массив { id, enabled }
                    menuSearch: "",
                    expandedGroups: {},
                    menuOpen: false,
                    toggleAllOn: true
                };
                
                self.rowHeight = 28;
                self.padding = 10;
                self.clickZones = [];
                self._lastBypassedCount = -1;
                self._lastSyncTimestamp = 0; // для ограничения частоты синхронизации
                
                const stateWidget = self.widgets.find(w => w.name === "bypass_state");
                const isNewNode = !stateWidget.value || stateWidget.value === "{}";

                if (stateWidget) {
                    stateWidget.hidden = true;
                    stateWidget.tooltip = "";
                    stateWidget.type = "hidden";
                    
                    if (stateWidget.element) {
                        stateWidget.element.style.display = "none";
                        stateWidget.element.style.pointerEvents = "none";
                    }
                    
                    stateWidget.computeSize = () => [0, 0];
                    
                    if (!isNewNode) {
                        try {
                            const savedData = JSON.parse(stateWidget.value || "{}");
                            if (savedData && typeof savedData === 'object') {
                                // Преобразуем старые форматы (массивы id) в новый формат
                                if (Array.isArray(savedData.nodes)) {
                                    if (savedData.nodes.length && typeof savedData.nodes[0] === 'number') {
                                        self.data.bypassedNodes = savedData.nodes.map(id => ({ id, enabled: true }));
                                    } else {
                                        self.data.bypassedNodes = savedData.nodes;
                                    }
                                }
                                if (Array.isArray(savedData.groups)) {
                                    if (savedData.groups.length && typeof savedData.groups[0] === 'number') {
                                        self.data.bypassedGroups = savedData.groups.map(id => ({ id, enabled: true }));
                                    } else {
                                        self.data.bypassedGroups = savedData.groups;
                                    }
                                }
                                if (savedData.toggleAllOn !== undefined) self.data.toggleAllOn = savedData.toggleAllOn;
                            }
                        } catch (e) {
                            console.error("[Rayko] Error loading saved data", e);
                        }
                    }
                    
                    stateWidget.serializeValue = () => {
                        self._rs_syncData();
                        return JSON.stringify({
                            nodes: self.data.bypassedNodes,
                            groups: self.data.bypassedGroups,
                            toggleAllOn: self.data.toggleAllOn
                        });
                    };
                }
                
                self.setSize([240, 180]);
                
                self.computeSize = function() {
                    const count = self.data.bypassedNodes.length + self.data.bypassedGroups.length;
                    const hasItems = count > 0;
                    const calculatedHeight = 43 + (hasItems ? 38 : 0) + (count * 28) + 8;
                    return [240, Math.max(80, calculatedHeight)];
                };
                
                self.drawLabel = function(ctx, text, x, y, w, h) {
                    ctx.fillStyle = "#aaa";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(text, x, y + h/2 + 4);
                };

                self.drawField = function(ctx, value, x, y, w, h, isActive = false) {
                    ctx.fillStyle = isActive ? "#333" : "#222";
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = isActive ? "#ff9800" : "#444";
                    ctx.lineWidth = isActive ? 2 : 1;
                    ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = isActive ? "#ff9800" : "#fff";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(value, x + 8, y + h/2 + 4);
                    ctx.fillStyle = "#666";
                    ctx.beginPath();
                    ctx.moveTo(x + w - 15, y + h/2 - 3);
                    ctx.lineTo(x + w - 9, y + h/2 - 3);
                    ctx.lineTo(x + w - 12, y + h/2 + 3);
                    ctx.fill();
                    ctx.lineWidth = 1;
                };

                self.drawToggle = function(ctx, isOn, x, y, w, h) {
                    const toggleW = 36;
                    const toggleH = 18;
                    const toggleX = x;
                    const toggleY = y + (h - toggleH) / 2;
                    const radius = toggleH / 2;
                    const knobRadius = radius - 2;
                    const knobOffset = isOn ? toggleW - radius - 2 : 2;
                    
                    ctx.fillStyle = isOn ? "#4CAF50" : "#555";
                    ctx.beginPath();
                    ctx.roundRect(toggleX, toggleY, toggleW, toggleH, radius);
                    ctx.fill();
                    
                    ctx.fillStyle = "#fff";
                    ctx.beginPath();
                    ctx.arc(toggleX + knobOffset, toggleY + radius, knobRadius, 0, Math.PI * 2);
                    ctx.fill();
                    
                    return { x: toggleX, y: toggleY, w: toggleW, h: toggleH };
                };

                self.drawBypassedItem = function(ctx, title, x, y, w, h, index, isBypassed) {
                    const toggleZone = self.drawToggle(ctx, isBypassed, x, y, 36, h);
                    
                    const textX = x + 44;
                    const textW = w - 64;
                    
                    ctx.fillStyle = index % 2 === 0 ? "rgba(255,68,68,0.1)" : "rgba(255,68,68,0.05)";
                    ctx.fillRect(textX, y, textW, h);
                    
                    ctx.fillStyle = "#ff4444";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(title, textX + 8, y + h/2 + 4);
                    
                    ctx.fillStyle = "#ff6666";
                    ctx.fillText("✕", textX + textW - 12, y + h/2 + 4);
                    
                    return { toggle: toggleZone, remove: { x: textX + textW - 20, y: y, w: 20, h: h } };
                };

                // Синхронизация с внешними изменениями (через интерфейс ComfyUI)
                self._rs_syncFromExternal = function() {
                    const now = Date.now();
                    // Ограничиваем частоту синхронизации (не чаще 1 раза в 300 мс)
                    if (now - self._lastSyncTimestamp < 300) return;
                    self._lastSyncTimestamp = now;

                    const nodes = app.graph._nodes || [];
                    const groups = app.graph._groups || [];
                    let changed = false;

                    // Синхронизация групп
                    self.data.bypassedGroups.forEach(item => {
                        const group = groups.find(g => g.id === item.id);
                        if (!group) return;
                        const groupNodes = nodes.filter(n => isNodeInGroup(n, group));
                        if (groupNodes.length === 0) return;
                        const allBypassed = groupNodes.every(n => n.mode === 4);
                        const anyBypassed = groupNodes.some(n => n.mode === 4);
                        // Если все забайпашены -> enabled = true; если ни одна -> false; иначе оставляем как есть (частичный байпас)
                        if (allBypassed && !item.enabled) {
                            item.enabled = true;
                            changed = true;
                        } else if (!anyBypassed && item.enabled) {
                            item.enabled = false;
                            changed = true;
                        }
                        // Частичный случай: оставляем текущее enabled (может быть true или false)
                        // Но если включен частичный, мы не можем точно определить, поэтому лучше не трогать.
                        // Можно также установить enabled = anyBypassed, но тогда при частичном байпасе тоггл будет включён.
                        // Реализуем как anyBypassed для согласованности:
                        if (anyBypassed && !allBypassed) {
                            // Частичный байпас: если ранее было false, то меняем на true, чтобы отображать активность
                            if (!item.enabled) {
                                item.enabled = true;
                                changed = true;
                            }
                        }
                    });

                    // Синхронизация отдельных нод
                    self.data.bypassedNodes.forEach(item => {
                        const node = nodes.find(n => n.id === item.id);
                        if (!node) return;
                        // Проверяем, не входит ли нода в группу из кэша
                        const inCachedGroup = self.data.bypassedGroups.some(gItem => {
                            const group = groups.find(g => g.id === gItem.id);
                            return group && isNodeInGroup(node, group);
                        });
                        if (inCachedGroup) {
                            // Если нода в группе, то она управляется группой, поэтому синхронизируем её enabled с группой
                            const groupEntry = self.data.bypassedGroups.find(gItem => {
                                const group = groups.find(g => g.id === gItem.id);
                                return group && isNodeInGroup(node, group);
                            });
                            if (groupEntry && groupEntry.enabled !== item.enabled) {
                                item.enabled = groupEntry.enabled;
                                changed = true;
                            }
                        } else {
                            // Отдельная нода
                            const isBypassed = node.mode === 4;
                            if (isBypassed !== item.enabled) {
                                item.enabled = isBypassed;
                                changed = true;
                            }
                        }
                    });

                    // Также проверяем, есть ли новые забайпашенные ноды/группы, которых нет в кэше
                    // (это может быть, если пользователь забайпасил что-то вручную)
                    groups.forEach(group => {
                        if (!group || !group.bounding && !group._bounding) return;
                        const groupNodes = nodes.filter(n => n.comfyClass !== "RS_Bypass" && isNodeInGroup(n, group));
                        if (groupNodes.length === 0) return;
                        const allBypassed = groupNodes.every(n => n.mode === 4);
                        if (allBypassed) {
                            if (!self.data.bypassedGroups.some(item => item.id === group.id)) {
                                self.data.bypassedGroups.push({ id: group.id, enabled: true });
                                changed = true;
                            }
                        }
                    });

                    nodes.forEach(n => {
                        if (n.comfyClass === "RS_Bypass") return;
                        if (n.mode === 4) {
                            const inGroup = groups.some(g => g && (g.bounding || g._bounding) && isNodeInGroup(n, g));
                            if (!inGroup) {
                                if (!self.data.bypassedNodes.some(item => item.id === n.id)) {
                                    self.data.bypassedNodes.push({ id: n.id, enabled: true });
                                    changed = true;
                                }
                            }
                        }
                    });

                    // Если были изменения, обновляем UI и сохраняем
                    if (changed) {
                        self._rs_syncData();
                        self._rs_updateUI();
                        self.graph?.setDirtyCanvas(true, true);
                    }
                };

                self.onDrawForeground = function(ctx, visibleRect) {
                    // Синхронизация с внешними изменениями перед отрисовкой
                    self._rs_syncFromExternal();

                    self.clickZones = [];
                    const pad = self.padding;
                    const rowH = self.rowHeight;
                    
                    let y = 5;

                    self.drawLabel(ctx, "BYPASS", pad, y, 50, rowH);
                    self.drawField(ctx, "SELECT ITEM", pad + 50, y, self.size[0] - pad*2 - 50, rowH, self.data.menuOpen);
                    self.clickZones.push({ type: "select", x: pad + 50, y: y, w: self.size[0] - pad*2 - 50, h: rowH });
                    y += rowH + 10;

                    // Строим список из кэша, используя сохранённое состояние enabled
                    const nodes = app.graph._nodes || [];
                    const groups = app.graph._groups || [];
                    
                    const displayItems = [];
                    
                    // Группы из кэша
                    self.data.bypassedGroups.forEach(item => {
                        const group = groups.find(g => g.id === item.id);
                        if (group) {
                            displayItems.push({ 
                                type: "group", 
                                id: group.id, 
                                title: "📁 " + (group.title || "Group"), 
                                isBypassed: item.enabled 
                            });
                        }
                    });
                    
                    // Отдельные ноды из кэша, исключая те, что входят в группы из кэша (чтобы не дублировать)
                    self.data.bypassedNodes.forEach(item => {
                        const targetNode = nodes.find(n => n.id === item.id);
                        if (targetNode) {
                            // Проверяем, не входит ли нода в какую-либо группу из кэша
                            const inCachedGroup = self.data.bypassedGroups.some(gItem => {
                                const group = groups.find(g => g.id === gItem.id);
                                return group && isNodeInGroup(targetNode, group);
                            });
                            if (!inCachedGroup) {
                                displayItems.push({ 
                                    type: "node", 
                                    id: targetNode.id, 
                                    title: "️ " + (targetNode.title || targetNode.type), 
                                    isBypassed: item.enabled 
                                });
                            }
                        }
                    });

                    // TOGGLE ALL строка
                    if (displayItems.length > 0) {
                        self.drawLabel(ctx, "TOGGLE ALL", pad, y, 100, rowH);
                        const toggleZone = self.drawToggle(ctx, self.data.toggleAllOn, pad + 100, y, self.size[0] - pad*2 - 100, rowH);
                        self.clickZones.push({ 
                            type: "toggleAll", 
                            x: toggleZone.x, 
                            y: toggleZone.y, 
                            w: toggleZone.w, 
                            h: toggleZone.h 
                        });
                        y += rowH + 10;
                    }

                    // Рисуем элементы списка
                    displayItems.forEach((item, index) => {
                        const itemY = y + (index * rowH);
                        const zones = self.drawBypassedItem(ctx, item.title, pad, itemY, self.size[0] - pad*2, rowH, index, item.isBypassed);
                        
                        self.clickZones.push({ 
                            type: "itemToggle", 
                            itemType: item.type, 
                            id: item.id, 
                            x: zones.toggle.x, 
                            y: zones.toggle.y, 
                            w: zones.toggle.w, 
                            h: zones.toggle.h 
                        });
                        
                        self.clickZones.push({ 
                            type: "remove", 
                            itemType: item.type, 
                            id: item.id, 
                            x: zones.remove.x, 
                            y: zones.remove.y, 
                            w: zones.remove.w, 
                            h: zones.remove.h 
                        });
                    });

                    const currentCount = displayItems.length;
                    if (self._lastBypassedCount !== currentCount) {
                        self._lastBypassedCount = currentCount;
                        self._rs_updateUI();
                    }
                };

                self.showBypassMenu = function(clickEvent) {
                    if (self.data.menuOpen) {
                        self._rs_closeMenu();
                        return;
                    }
                    
                    // Синхронизация перед открытием меню
                    self._rs_syncFromExternal();
                    
                    const existingMenu = document.getElementById("rs-bypass-menu");
                    if (existingMenu) existingMenu.remove();
                    
                    const menu = document.createElement("div");
                    menu.id = "rs-bypass-menu";
                    menu.style.cssText = "position:fixed;background:#1a1a1a;border:2px solid #ff9800;border-radius:6px;max-height:500px;overflow-y:auto;z-index:10001;box-shadow:0 4px 20px rgba(255,152,0,0.3);min-width:350px;transition:box-shadow 0.2s;";
                    
                    const searchInput = document.createElement("input");
                    searchInput.type = "text";
                    searchInput.placeholder = " Search nodes/groups...";
                    searchInput.style.cssText = "width:100%;padding:10px;background:#252525;color:#fff;border:none;border-bottom:1px solid #333;box-sizing:border-box;font-size:12px;outline:none;";
                    searchInput.value = self.data.menuSearch || "";
                    menu.appendChild(searchInput);
                    
                    const contentDiv = document.createElement("div");
                    contentDiv.id = "rs-bypass-content";
                    menu.appendChild(contentDiv);
                    
                    if (clickEvent) {
                        menu.style.left = (clickEvent.clientX + 8) + "px";
                        menu.style.top = clickEvent.clientY + "px";
                    }
                    
                    let closeTimer = null;
                    const closeDelay = 300;
                    
                    menu.addEventListener("mouseleave", () => {
                        closeTimer = setTimeout(() => {
                            self._rs_closeMenu();
                        }, closeDelay);
                    });
                    
                    menu.addEventListener("mouseenter", () => {
                        if (closeTimer) {
                            clearTimeout(closeTimer);
                            closeTimer = null;
                        }
                    });
                    
                    function renderContent() {
                        contentDiv.innerHTML = "";
                        const query = searchInput.value.toLowerCase();
                        self.data.menuSearch = query;
                        
                        const groups = app.graph._groups || [];
                        const nodes = app.graph._nodes || [];
                        
                        const filteredNodes = nodes.filter(n => n.comfyClass !== "RS_Bypass");
                        
                        let hasItems = false;
                        
                        groups.forEach(group => {
                            if (!group || !group.bounding && !group._bounding) {
                                return;
                            }
                            
                            const groupNodes = filteredNodes.filter(n => isNodeInGroup(n, group));
                            if (groupNodes.length === 0) return;
                            
                            const title = group.title || "Group " + group.id;
                            if (query && !title.toLowerCase().includes(query)) return;
                            
                            // Проверяем, есть ли уже группа в кэше
                            const cachedGroup = self.data.bypassedGroups.find(item => item.id === group.id);
                            const isAllBypassed = cachedGroup ? cachedGroup.enabled : false;
                            const isPartialBypassed = false; // упростим
                            const isExpanded = self.data.expandedGroups[group.id] || false;
                            
                            let groupColor = "#ddd";
                            if (isAllBypassed) groupColor = "#ff4444";
                            
                            const groupItem = document.createElement("div");
                            groupItem.style.cssText = "padding:10px 12px;cursor:pointer;color:" + groupColor + ";border-bottom:1px solid #333;font-size:12px;display:flex;align-items:center;transition:background-color 0.15s;";
                            
                            const arrow = document.createElement("span");
                            arrow.textContent = isExpanded ? "▼ " : "▶ ";
                            arrow.style.cssText = "margin-right:8px;font-size:10px;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid #555;border-radius:4px;";
                            arrow.onclick = (ev) => {
                                ev.stopPropagation();
                                self.data.expandedGroups[group.id] = !isExpanded;
                                renderContent();
                            };
                            groupItem.appendChild(arrow);
                            
                            const groupText = document.createElement("span");
                            groupText.textContent = " " + title;
                            groupText.style.cssText = "flex:1;margin-left:4px;";
                            groupText.onclick = (ev) => {
                                ev.stopPropagation();
                                // Добавляем или удаляем группу из кэша
                                let entry = self.data.bypassedGroups.find(item => item.id === group.id);
                                if (entry) {
                                    // Если уже есть, переключаем enabled
                                    entry.enabled = !entry.enabled;
                                } else {
                                    // Добавляем с enabled: true
                                    entry = { id: group.id, enabled: true };
                                    self.data.bypassedGroups.push(entry);
                                }
                                // Применяем байпас ко всем нодам группы
                                groupNodes.forEach(n => setNodeBypass(n, entry.enabled));
                                self._rs_syncData();
                                self._rs_updateUI();
                                renderContent();
                            };
                            groupItem.appendChild(groupText);
                            
                            groupItem.onmouseover = () => groupItem.style.background = "#333";
                            groupItem.onmouseout = () => groupItem.style.background = "#1a1a1a";
                            
                            contentDiv.appendChild(groupItem);
                            hasItems = true;
                            
                            if (isExpanded) {
                                groupNodes.forEach(n => {
                                    const nodeTitle = n.title || n.type;
                                    if (query && !nodeTitle.toLowerCase().includes(query)) return;
                                    
                                    const cachedNode = self.data.bypassedNodes.find(item => item.id === n.id);
                                    const isNodeBypassed = cachedNode ? cachedNode.enabled : false;
                                    const nodeColor = isNodeBypassed ? "#ff4444" : "#ddd";
                                    
                                    const nodeItem = document.createElement("div");
                                    nodeItem.textContent = "️ " + nodeTitle;
                                    nodeItem.style.cssText = "padding:10px 12px 10px 32px;cursor:pointer;color:" + nodeColor + ";border-bottom:1px solid #333;font-size:12px;transition:background-color 0.15s;";
                                    nodeItem.onmouseover = () => nodeItem.style.background = "#333";
                                    nodeItem.onmouseout = () => nodeItem.style.background = "#1a1a1a";
                                    nodeItem.onclick = (ev) => {
                                        ev.stopPropagation();
                                        let entry = self.data.bypassedNodes.find(item => item.id === n.id);
                                        if (entry) {
                                            entry.enabled = !entry.enabled;
                                        } else {
                                            entry = { id: n.id, enabled: true };
                                            self.data.bypassedNodes.push(entry);
                                        }
                                        setNodeBypass(n, entry.enabled);
                                        self._rs_syncData();
                                        self._rs_updateUI();
                                        renderContent();
                                    };
                                    contentDiv.appendChild(nodeItem);
                                });
                            }
                        });
                        
                        const ungroupedNodes = filteredNodes.filter(n => !groups.some(g => g && (g.bounding || g._bounding) && isNodeInGroup(n, g)));
                        ungroupedNodes.forEach(n => {
                            const title = n.title || n.type;
                            if (query && !title.toLowerCase().includes(query)) return;
                            
                            const cachedNode = self.data.bypassedNodes.find(item => item.id === n.id);
                            const isBypassed = cachedNode ? cachedNode.enabled : false;
                            const nodeColor = isBypassed ? "#ff4444" : "#ddd";
                            
                            const item = document.createElement("div");
                            item.textContent = "⚙️ " + title;
                            item.style.cssText = "padding:10px 12px;cursor:pointer;color:" + nodeColor + ";border-bottom:1px solid #333;font-size:12px;transition:background-color 0.15s;";
                            item.onmouseover = () => item.style.background = "#333";
                            item.onmouseout = () => item.style.background = "#1a1a1a";
                            item.onclick = (ev) => {
                                ev.stopPropagation();
                                let entry = self.data.bypassedNodes.find(item => item.id === n.id);
                                if (entry) {
                                    entry.enabled = !entry.enabled;
                                } else {
                                    entry = { id: n.id, enabled: true };
                                    self.data.bypassedNodes.push(entry);
                                }
                                setNodeBypass(n, entry.enabled);
                                self._rs_syncData();
                                self._rs_updateUI();
                                renderContent();
                            };
                            contentDiv.appendChild(item);
                            hasItems = true;
                        });
                        
                        if (!hasItems) {
                            const emptyMsg = document.createElement("div");
                            emptyMsg.textContent = "No nodes/groups found";
                            emptyMsg.style.cssText = "padding:15px;text-align:center;color:#666;font-size:12px;";
                            contentDiv.appendChild(emptyMsg);
                        }
                    }
                    
                    searchInput.addEventListener("input", renderContent);
                    
                    const closeEsc = (ev) => {
                        if (ev.key === "Escape") self._rs_closeMenu();
                    };
                    
                    document.addEventListener("keydown", closeEsc);
                    
                    renderContent();
                    document.body.appendChild(menu);
                    
                    self.data.menuOpen = true;
                    self._rs_updateUI();
                    
                    setTimeout(() => searchInput.focus(), 10);
                };

                self._rs_closeMenu = function() {
                    const menu = document.getElementById("rs-bypass-menu");
                    if (menu) {
                        menu.remove();
                    }
                    self.data.menuOpen = false;
                    self._rs_updateUI();
                };

                self.onMouseDown = function(e, pos, canvas) {
                    if (!self.clickZones.length) return false;
                    
                    for (const zone of self.clickZones) {
                        const inX = pos[0] >= zone.x && pos[0] <= zone.x + zone.w;
                        const inY = pos[1] >= zone.y && pos[1] <= zone.y + zone.h;
                        
                        if (inX && inY) {
                            if (zone.type === "select") {
                                self.showBypassMenu(e);
                                return true;
                            }
                            
                            if (zone.type === "toggleAll") {
                                self.data.toggleAllOn = !self.data.toggleAllOn;
                                const newState = self.data.toggleAllOn;
                                
                                // Меняем enabled у всех элементов в кэше
                                self.data.bypassedGroups.forEach(item => item.enabled = newState);
                                self.data.bypassedNodes.forEach(item => item.enabled = newState);
                                
                                // Применяем байпас
                                const nodes = app.graph._nodes || [];
                                const groups = app.graph._groups || [];
                                self.data.bypassedGroups.forEach(item => {
                                    const group = groups.find(g => g.id === item.id);
                                    if (group) {
                                        const groupNodes = nodes.filter(n => isNodeInGroup(n, group));
                                        groupNodes.forEach(n => setNodeBypass(n, newState));
                                    }
                                });
                                self.data.bypassedNodes.forEach(item => {
                                    const targetNode = nodes.find(n => n.id === item.id);
                                    if (targetNode) {
                                        // Проверяем, не входит ли нода в группу из кэша
                                        const inGroup = self.data.bypassedGroups.some(gItem => {
                                            const group = groups.find(g => g.id === gItem.id);
                                            return group && isNodeInGroup(targetNode, group);
                                        });
                                        if (!inGroup) setNodeBypass(targetNode, newState);
                                    }
                                });
                                
                                self._rs_syncData();
                                self._rs_updateUI();
                                return true;
                            }
                            
                            if (zone.type === "itemToggle") {
                                if (zone.itemType === "group") {
                                    const group = app.graph._groups.find(g => g.id === zone.id);
                                    if (group) {
                                        const groupNodes = app.graph._nodes.filter(n => isNodeInGroup(n, group));
                                        let entry = self.data.bypassedGroups.find(item => item.id === zone.id);
                                        if (!entry) {
                                            entry = { id: zone.id, enabled: false };
                                            self.data.bypassedGroups.push(entry);
                                        }
                                        entry.enabled = !entry.enabled;
                                        groupNodes.forEach(n => setNodeBypass(n, entry.enabled));
                                    }
                                } else {
                                    const targetNode = app.graph._nodes.find(n => n.id === zone.id);
                                    if (targetNode) {
                                        let entry = self.data.bypassedNodes.find(item => item.id === zone.id);
                                        if (!entry) {
                                            entry = { id: zone.id, enabled: false };
                                            self.data.bypassedNodes.push(entry);
                                        }
                                        entry.enabled = !entry.enabled;
                                        setNodeBypass(targetNode, entry.enabled);
                                    }
                                }
                                self._rs_syncData();
                                self._rs_updateUI();
                                return true;
                            }
                            
                            if (zone.type === "remove") {
                                if (zone.itemType === "group") {
                                    const group = app.graph._groups.find(g => g.id === zone.id);
                                    if (group) {
                                        const groupNodes = app.graph._nodes.filter(n => isNodeInGroup(n, group));
                                        groupNodes.forEach(n => setNodeBypass(n, false));
                                    }
                                    self.data.bypassedGroups = self.data.bypassedGroups.filter(item => item.id !== zone.id);
                                } else {
                                    const targetNode = app.graph._nodes.find(n => n.id === zone.id);
                                    if (targetNode) {
                                        setNodeBypass(targetNode, false);
                                    }
                                    self.data.bypassedNodes = self.data.bypassedNodes.filter(item => item.id !== zone.id);
                                }
                                self._rs_syncData();
                                self._rs_updateUI();
                                return true;
                            }
                        }
                    }
                    return false;
                };

                self._rs_updateUI = function() {
                    const pad = self.padding;
                    const rowH = self.rowHeight;
                    const bypassedItemsCount = self._lastBypassedCount >= 0 ? self._lastBypassedCount : (self.data.bypassedGroups.length + self.data.bypassedNodes.length);
                    const hasItems = bypassedItemsCount > 0;
                    
                    let y = 5;
                    y += rowH;
                    y += 10;
                    if (hasItems) {
                        y += rowH;
                        y += 10;
                    }
                    y += (bypassedItemsCount * rowH);
                    y += 8;
                    
                    const minHeight = 80;
                    const minWidth = 220;
                    
                    const newHeight = Math.max(minHeight, y);
                    const newWidth = Math.max(minWidth, self.size[0]);
                    
                    if (self.size[1] !== newHeight || self.size[0] !== newWidth) {
                        self.setSize([newWidth, newHeight]);
                    }
                    self.graph?.setDirtyCanvas(true, true);
                };

                self._rs_applyBypass = function() {
                    const nodes = app.graph._nodes || [];
                    const groups = app.graph._groups || [];
                    
                    // Включаем байпас только для элементов с enabled === true
                    self.data.bypassedGroups.forEach(item => {
                        if (!item.enabled) return;
                        const group = groups.find(g => g.id === item.id);
                        if (group) {
                            const groupNodes = nodes.filter(n => isNodeInGroup(n, group));
                            groupNodes.forEach(n => setNodeBypass(n, true));
                        }
                    });
                    
                    self.data.bypassedNodes.forEach(item => {
                        if (!item.enabled) return;
                        const targetNode = nodes.find(n => n.id === item.id);
                        if (targetNode) {
                            // Проверяем, не входит ли нода в уже забайпашенную группу
                            const inBypassedGroup = self.data.bypassedGroups.some(gItem => {
                                if (!gItem.enabled) return false;
                                const group = groups.find(g => g.id === gItem.id);
                                return group && isNodeInGroup(targetNode, group);
                            });
                            if (!inBypassedGroup) {
                                setNodeBypass(targetNode, true);
                            }
                        }
                    });
                };

                self._rs_discoverExistingBypasses = function() {
                    const nodes = app.graph._nodes || [];
                    const groups = app.graph._groups || [];
                    
                    // 1. Полностью забайпашенные группы
                    groups.forEach(group => {
                        if (!group || !group.bounding && !group._bounding) return;
                        const groupNodes = nodes.filter(n => n.comfyClass !== "RS_Bypass" && isNodeInGroup(n, group));
                        if (groupNodes.length > 0 && groupNodes.every(n => n.mode === 4)) {
                            // Добавляем группу в кэш, если её там нет
                            if (!self.data.bypassedGroups.some(item => item.id === group.id)) {
                                self.data.bypassedGroups.push({ id: group.id, enabled: true });
                            } else {
                                // Обновляем enabled
                                const entry = self.data.bypassedGroups.find(item => item.id === group.id);
                                if (entry) entry.enabled = true;
                            }
                        }
                    });

                    // 2. Отдельные ноды с mode=4, не входящие ни в какую группу
                    nodes.forEach(n => {
                        if (n.comfyClass === "RS_Bypass") return;
                        if (n.mode === 4) {
                            const inAnyGroup = groups.some(g => g && (g.bounding || g._bounding) && isNodeInGroup(n, g));
                            if (!inAnyGroup) {
                                if (!self.data.bypassedNodes.some(item => item.id === n.id)) {
                                    self.data.bypassedNodes.push({ id: n.id, enabled: true });
                                } else {
                                    const entry = self.data.bypassedNodes.find(item => item.id === n.id);
                                    if (entry) entry.enabled = true;
                                }
                            }
                        }
                    });
                };

                self._rs_syncData = function() {
                    if (stateWidget) {
                        stateWidget.value = JSON.stringify({
                            nodes: self.data.bypassedNodes,
                            groups: self.data.bypassedGroups,
                            toggleAllOn: self.data.toggleAllOn
                        });
                    }
                    if (self.graph) {
                        self.graph.changeTracker?.dispatchEvent(new Event("change"));
                    }
                };

                const onSerialize = self.onSerialize;
                self.onSerialize = function(o) {
                    self._rs_syncData();
                    if (onSerialize) {
                        return onSerialize.apply(this, arguments);
                    }
                };

                const onConfigure = self.onConfigure;
                self.onConfigure = function(o) {
                    if (onConfigure) {
                        onConfigure.apply(this, arguments);
                    }
                    
                    if (stateWidget && stateWidget.value) {
                        try {
                            const restoredData = JSON.parse(stateWidget.value);
                            if (restoredData) {
                                // Преобразование при необходимости
                                if (Array.isArray(restoredData.nodes)) {
                                    if (restoredData.nodes.length && typeof restoredData.nodes[0] === 'number') {
                                        self.data.bypassedNodes = restoredData.nodes.map(id => ({ id, enabled: true }));
                                    } else {
                                        self.data.bypassedNodes = restoredData.nodes;
                                    }
                                }
                                if (Array.isArray(restoredData.groups)) {
                                    if (restoredData.groups.length && typeof restoredData.groups[0] === 'number') {
                                        self.data.bypassedGroups = restoredData.groups.map(id => ({ id, enabled: true }));
                                    } else {
                                        self.data.bypassedGroups = restoredData.groups;
                                    }
                                }
                                if (restoredData.toggleAllOn !== undefined) self.data.toggleAllOn = restoredData.toggleAllOn;
                            }
                        } catch (e) {
                            console.error("[Rayko] Error restoring data:", e);
                        }
                    }
                    
                    self._rs_applyBypass();
                    self._rs_updateUI();
                    
                    setTimeout(() => {
                        self.graph?.setDirtyCanvas(true, true);
                        app.graph.setDirtyCanvas(true, true);
                    }, 10);
                };

                setTimeout(() => {
                    if (isNewNode) {
                        self._rs_discoverExistingBypasses();
                        self._rs_syncData();
                    } else {
                        self._rs_applyBypass();
                    }
                    self._rs_updateUI();
                }, 100);

                return result;
            };
        }
    }
});
