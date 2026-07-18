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
                
                self.data = {
                    bypassedNodes: [],
                    bypassedGroups: [],
                    menuSearch: "",
                    expandedGroups: {},
                    menuOpen: false
                };
                
                self.rowHeight = 28;
                self.padding = 10;
                self.clickZones = [];
                self._lastBypassedCount = -1;
                
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
                                if (savedData.nodes) self.data.bypassedNodes = savedData.nodes;
                                if (savedData.groups) self.data.bypassedGroups = savedData.groups;
                            }
                        } catch (e) {
                            console.error("[Rayko] Error loading saved data", e);
                        }
                    }
                    
                    stateWidget.serializeValue = () => {
                        self._rs_syncData();
                        return JSON.stringify({
                            nodes: self.data.bypassedNodes,
                            groups: self.data.bypassedGroups
                        });
                    };
                }
                
                self.setSize([220, 180]);
                
                self.computeSize = function() {
                    const count = self.data.bypassedNodes.length + self.data.bypassedGroups.length;
                    const calculatedHeight = 63 + (count * 28);
                    return [220, Math.max(80, calculatedHeight)];
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

                self.drawBypassedItem = function(ctx, title, x, y, w, h, index) {
                    ctx.fillStyle = index % 2 === 0 ? "rgba(255,68,68,0.1)" : "rgba(255,68,68,0.05)";
                    ctx.fillRect(x, y, w, h);
                    ctx.fillStyle = "#ff4444";
                    ctx.font = "11px sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(title, x + 8, y + h/2 + 4);
                    ctx.fillStyle = "#ff6666";
                    ctx.fillText("✕", x + w - 20, y + h/2 + 4);
                };

                self.onDrawForeground = function(ctx, visibleRect) {
                    self.clickZones = [];
                    const pad = self.padding;
                    const rowH = self.rowHeight;
                    
                    let y = 5;

                    self.drawLabel(ctx, "BYPASS", pad, y, 50, rowH);
                    self.drawField(ctx, "SELECT...", pad + 50, y, self.size[0] - pad*2 - 50, rowH, self.data.menuOpen);
                    self.clickZones.push({ type: "select", x: pad + 50, y: y, w: self.size[0] - pad*2 - 50, h: rowH });
                    y += rowH + 10;

                    const bypassedItems = [];
                    const nodes = app.graph._nodes || [];
                    const groups = app.graph._groups || [];
                    
                    const fullyBypassedGroupIds = [];
                    groups.forEach(group => {
                        if (!group || !group.bounding && !group._bounding) return;
                        const groupNodes = nodes.filter(n => n.comfyClass !== "RS_Bypass" && isNodeInGroup(n, group));
                        if (groupNodes.length > 0 && groupNodes.every(n => n.mode === 4)) {
                            fullyBypassedGroupIds.push(group.id);
                            bypassedItems.push({ type: "group", id: group.id, title: "📁 " + (group.title || "Group") });
                        }
                    });
                    
                    nodes.forEach(n => {
                        if (n.comfyClass === "RS_Bypass") return;
                        if (n.mode === 4) {
                            const inBypassedGroup = fullyBypassedGroupIds.some(groupId => {
                                const group = groups.find(g => g.id === groupId);
                                return group && isNodeInGroup(n, group);
                            });
                            
                            if (!inBypassedGroup) {
                                bypassedItems.push({ type: "node", id: n.id, title: "⚙️ " + (n.title || n.type) });
                            }
                        }
                    });

                    bypassedItems.forEach((item, index) => {
                        const itemY = y + (index * rowH);
                        self.drawBypassedItem(ctx, item.title, pad, itemY, self.size[0] - pad*2, rowH, index);
                        self.clickZones.push({ type: "remove", itemType: item.type, id: item.id, x: pad, y: itemY, w: self.size[0] - pad*2, h: rowH });
                    });

                    const bypassedCount = bypassedItems.length;
                    if (self._lastBypassedCount !== bypassedCount) {
                        self._lastBypassedCount = bypassedCount;
                        self._rs_updateUI();
                    }
                };

                self.showBypassMenu = function(clickEvent) {
                    if (self.data.menuOpen) {
                        self._rs_closeMenu();
                        return;
                    }
                    
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
                            
                            const bypassedCount = groupNodes.filter(n => n.mode === 4).length;
                            const isAllBypassed = bypassedCount === groupNodes.length;
                            const isPartialBypassed = bypassedCount > 0 && !isAllBypassed;
                            const isExpanded = self.data.expandedGroups[group.id] || false;
                            
                            let groupColor = "#ddd";
                            if (isAllBypassed) groupColor = "#ff4444";
                            else if (isPartialBypassed) groupColor = "#ff9800";
                            
                            const groupItem = document.createElement("div");
                            groupItem.style.cssText = "padding:10px 12px;cursor:pointer;color:" + groupColor + ";border-bottom:1px solid #333;font-size:12px;display:flex;align-items:center;transition:background-color 0.15s;";
                            
                            const arrow = document.createElement("span");
                            arrow.textContent = isExpanded ? "▼ " : "▶ ";
                            arrow.style.cssText = "margin-right:8px;font-size:10px;";
                            arrow.onclick = (ev) => {
                                ev.stopPropagation();
                                self.data.expandedGroups[group.id] = !isExpanded;
                                renderContent();
                            };
                            groupItem.appendChild(arrow);
                            
                            const groupText = document.createElement("span");
                            groupText.textContent = " " + title;
                            groupText.style.cssText = "flex:1;";
                            groupText.onclick = (ev) => {
                                ev.stopPropagation();
                                groupNodes.forEach(n => setNodeBypass(n, !isAllBypassed));
                                
                                if (!isAllBypassed) {
                                    if (!self.data.bypassedGroups.includes(group.id)) {
                                        self.data.bypassedGroups.push(group.id);
                                    }
                                } else {
                                    self.data.bypassedGroups = self.data.bypassedGroups.filter(id => id !== group.id);
                                }
                                
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
                                    
                                    const isNodeBypassed = n.mode === 4;
                                    const nodeColor = isNodeBypassed ? "#ff4444" : "#ddd";
                                    
                                    const nodeItem = document.createElement("div");
                                    nodeItem.textContent = "️ " + nodeTitle;
                                    nodeItem.style.cssText = "padding:10px 12px 10px 32px;cursor:pointer;color:" + nodeColor + ";border-bottom:1px solid #333;font-size:12px;transition:background-color 0.15s;";
                                    nodeItem.onmouseover = () => nodeItem.style.background = "#333";
                                    nodeItem.onmouseout = () => nodeItem.style.background = "#1a1a1a";
                                    nodeItem.onclick = (ev) => {
                                        ev.stopPropagation();
                                        setNodeBypass(n, !isNodeBypassed);
                                        
                                        if (!isNodeBypassed) {
                                            if (!self.data.bypassedNodes.includes(n.id)) {
                                                self.data.bypassedNodes.push(n.id);
                                            }
                                        } else {
                                            self.data.bypassedNodes = self.data.bypassedNodes.filter(id => id !== n.id);
                                        }
                                        
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
                            
                            const isBypassed = n.mode === 4;
                            const nodeColor = isBypassed ? "#ff4444" : "#ddd";
                            
                            const item = document.createElement("div");
                            item.textContent = "⚙️ " + title;
                            item.style.cssText = "padding:10px 12px;cursor:pointer;color:" + nodeColor + ";border-bottom:1px solid #333;font-size:12px;transition:background-color 0.15s;";
                            item.onmouseover = () => item.style.background = "#333";
                            item.onmouseout = () => item.style.background = "#1a1a1a";
                            item.onclick = (ev) => {
                                ev.stopPropagation();
                                setNodeBypass(n, !isBypassed);
                                
                                if (!isBypassed) {
                                    if (!self.data.bypassedNodes.includes(n.id)) {
                                        self.data.bypassedNodes.push(n.id);
                                    }
                                } else {
                                    self.data.bypassedNodes = self.data.bypassedNodes.filter(id => id !== n.id);
                                }
                                
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
                            if (zone.type === "remove") {
                                if (zone.itemType === "group") {
                                    const group = app.graph._groups.find(g => g.id === zone.id);
                                    if (group) {
                                        const groupNodes = app.graph._nodes.filter(n => isNodeInGroup(n, group));
                                        groupNodes.forEach(n => setNodeBypass(n, false));
                                        self.data.bypassedGroups = self.data.bypassedGroups.filter(id => id !== zone.id);
                                    }
                                } else {
                                    const targetNode = app.graph._nodes.find(n => n.id === zone.id);
                                    if (targetNode) {
                                        setNodeBypass(targetNode, false);
                                        self.data.bypassedNodes = self.data.bypassedNodes.filter(id => id !== zone.id);
                                    }
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
                    
                    let y = 5;
                    y += rowH;
                    y += 10;
                    y += (bypassedItemsCount * rowH);
                    y += 20;
                    
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
                    
                    self.data.bypassedGroups.forEach(groupId => {
                        const group = groups.find(g => g.id === groupId);
                        if (group) {
                            const groupNodes = nodes.filter(n => isNodeInGroup(n, group));
                            groupNodes.forEach(n => setNodeBypass(n, true));
                        }
                    });
                    
                    self.data.bypassedNodes.forEach(nodeId => {
                        const targetNode = nodes.find(n => n.id === nodeId);
                        if (targetNode) {
                            const inBypassedGroup = self.data.bypassedGroups.some(groupId => {
                                const group = groups.find(g => g.id === groupId);
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
                    
                    groups.forEach(group => {
                        if (!group || !group.bounding && !group._bounding) return;
                        const groupNodes = nodes.filter(n => n.comfyClass !== "RS_Bypass" && isNodeInGroup(n, group));
                        if (groupNodes.length > 0 && groupNodes.every(n => n.mode === 4)) {
                            if (!self.data.bypassedGroups.includes(group.id)) {
                                self.data.bypassedGroups.push(group.id);
                            }
                        }
                    });

                    nodes.forEach(n => {
                        if (n.comfyClass === "RS_Bypass") return;
                        if (n.mode === 4) {
                            const inBypassedGroup = self.data.bypassedGroups.some(groupId => {
                                const group = groups.find(g => g.id === groupId);
                                return group && isNodeInGroup(n, group);
                            });
                            
                            if (!inBypassedGroup && !self.data.bypassedNodes.includes(n.id)) {
                                self.data.bypassedNodes.push(n.id);
                            }
                        }
                    });
                };

                self._rs_syncData = function() {
                    if (stateWidget) {
                        stateWidget.value = JSON.stringify({
                            nodes: self.data.bypassedNodes,
                            groups: self.data.bypassedGroups
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
                                if (restoredData.nodes) self.data.bypassedNodes = restoredData.nodes;
                                if (restoredData.groups) self.data.bypassedGroups = restoredData.groups;
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