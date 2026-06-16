import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.AnySwitch",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RSAnySwitch") {
            const rebuildFromConnections = function() {
                const activeWidget = this.widgets.find(w => w.name === "active_input");
                const infoWidget = this.widgets.find(w => w.name === "info_display");
                if (!activeWidget) return;

                let maxConnectedIndex = 1;
                const connectedInputs = [];
                for (let i = 0; i < this.inputs.length; i++) {
                    const input = this.inputs[i];
                    if (input.link !== null) {
                        const match = input.name.match(/input_(\d+)/);
                        if (match) {
                            const idx = parseInt(match[1], 10);
                            if (idx > maxConnectedIndex) maxConnectedIndex = idx;
                            connectedInputs.push({ index: i, name: input.name, idx });
                        }
                    }
                }

                const minSlots = Math.max(2, maxConnectedIndex);
                for (let idx = 1; idx <= minSlots; idx++) {
                    const existing = this.inputs.find(inp => inp.name === `input_${idx}`);
                    if (!existing) {
                        this.addInput(`input_${idx}`, "*");
                    }
                }

                for (let i = this.inputs.length - 1; i >= 0; i--) {
                    const match = this.inputs[i].name.match(/input_(\d+)/);
                    if (match && parseInt(match[1], 10) > minSlots + 1) {
                        this.removeInput(i);
                    }
                }

                const currentSlotWidgets = this.widgets.filter(w => w.slotName && w.slotName.startsWith("input_"));
                for (let conn of connectedInputs) {
                    let widget = currentSlotWidgets.find(w => w.slotName === conn.name);
                    if (!widget) {
                        const targetNodeName = this.getConnectedNodeName(conn.index);
                        const prefix = `In ${conn.idx}: `;
                        let displayName = prefix + targetNodeName;
                        if (displayName.length > 35) displayName = prefix + targetNodeName.substring(0, 32) + "...";

                        widget = this.addWidget("toggle", displayName, false, (value) => {
                            if (value) {
                                if (activeWidget) activeWidget.value = widget.slotName;
                                if (infoWidget) infoWidget.value = this.getActiveSlotDisplayName(widget.slotName);
                                for (let w of this.widgets) {
                                    if (w !== widget && w.slotName && w.slotName.startsWith("input_")) {
                                        w.value = false;
                                    }
                                }
                            } else {
                                if (activeWidget) activeWidget.value = "none";
                                if (infoWidget) infoWidget.value = "OFF";
                            }
                            this.setDirtyCanvas(true, true);
                        }, {});
                        widget.slotName = conn.name;
                        widget.draw = function(ctx, node, w, y, h) {
                            ctx.fillStyle = "#222";
                            ctx.fillRect(0, y, w, h);
                            ctx.fillStyle = "#aaa";
                            ctx.font = "13px Arial";
                            ctx.textAlign = "left";
                            ctx.fillText(this.name, 10, y + h / 2 + 1);
                            const toggleW = 30, toggleH = 14;
                            const toggleX = w - toggleW - 10;
                            const toggleY = y + (h - toggleH) / 2;
                            ctx.fillStyle = this.value ? "#4a4" : "#666";
                            ctx.beginPath();
                            ctx.arc(toggleX + toggleH / 2, toggleY + toggleH / 2, toggleH / 2, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillRect(toggleX + toggleH / 2, toggleY, toggleW - toggleH, toggleH);
                            ctx.beginPath();
                            ctx.arc(toggleX + toggleW - toggleH / 2, toggleY + toggleH / 2, toggleH / 2, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = "#fff";
                            ctx.beginPath();
                            ctx.arc(this.value ? toggleX + toggleW - toggleH / 2 : toggleX + toggleH / 2, toggleY + toggleH / 2, toggleH / 2 - 2, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = this.value ? "#4a4" : "#a44";
                            ctx.font = "bold 12px Arial";
                            ctx.textAlign = "right";
                            ctx.fillText(this.value ? "ON" : "OFF", toggleX - 5, y + h / 2 + 1);
                        };

                        const targetPos = conn.idx + 1;
                        const currentPos = this.widgets.indexOf(widget);
                        if (currentPos !== targetPos) {
                            this.widgets.splice(currentPos, 1);
                            this.widgets.splice(targetPos, 0, widget);
                        }
                    } else {
                        const targetNodeName = this.getConnectedNodeName(conn.index);
                        const prefix = `In ${conn.idx}: `;
                        let displayName = prefix + targetNodeName;
                        if (displayName.length > 35) displayName = prefix + targetNodeName.substring(0, 32) + "...";
                        widget.name = displayName;
                    }
                    widget.value = (activeWidget.value === conn.name);
                }

                for (let w of currentSlotWidgets) {
                    if (!connectedInputs.some(conn => conn.name === w.slotName)) {
                        this.removeWidget(w);
                    }
                }

                if (infoWidget) {
                    const activeName = activeWidget.value;
                    infoWidget.value = this.getActiveSlotDisplayName(activeName);
                }

                this.setSize(this.computeSize());
                this.size[0] = 350;
                this.setSize(this.size);
                this.setDirtyCanvas(true, true);
            };

            const getConnectedNodeName = function(inputIndex) {
                const link = this.inputs[inputIndex]?.link;
                if (!link) return "Unknown";
                const linkInfo = app.graph.links[link];
                if (!linkInfo) return "Unknown";
                const originNode = app.graph.getNodeById(linkInfo.origin_id);
                return originNode ? (originNode.getTitle() || originNode.type) : "Unknown";
            };
            nodeType.prototype.getConnectedNodeName = getConnectedNodeName;

            const getActiveSlotDisplayName = function(slotName) {
                if (!slotName || slotName === "none") return "OFF";
                const match = slotName.match(/input_(\d+)/);
                if (!match) return "OFF";
                const idx = parseInt(match[1], 10);
                const inputIndex = idx - 1;
                const nodeName = this.getConnectedNodeName(inputIndex);
                const prefix = `IN ${idx}: `;
                const nodeNameUpper = nodeName.toUpperCase();
                let displayName = prefix + nodeNameUpper;
                if (displayName.length > 40) {
                    const availableForName = 40 - prefix.length - 3;
                    displayName = prefix + nodeNameUpper.substring(0, Math.max(0, availableForName)) + "...";
                }
                return displayName;
            };
            nodeType.prototype.getActiveSlotDisplayName = getActiveSlotDisplayName;

            const updateSlotNames = function() {
                const activeWidget = this.widgets.find(w => w.name === "active_input");
                const infoWidget = this.widgets.find(w => w.name === "info_display");
                
                const toggleWidgets = this.widgets.filter(w => w.slotName && w.slotName.startsWith("input_"));
                for (let widget of toggleWidgets) {
                    const match = widget.slotName.match(/input_(\d+)/);
                    if (match) {
                        const idx = parseInt(match[1], 10);
                        const targetNodeName = this.getConnectedNodeName(idx - 1);
                        const prefix = `In ${idx}: `;
                        let displayName = prefix + targetNodeName;
                        if (displayName.length > 35) displayName = prefix + targetNodeName.substring(0, 32) + "...";
                        widget.name = displayName;
                    }
                }
                
                if (infoWidget && activeWidget) {
                    infoWidget.value = this.getActiveSlotDisplayName(activeWidget.value);
                }
                
                this.setDirtyCanvas(true, true);
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                const activeWidget = this.widgets.find(w => w.name === "active_input");
                if (activeWidget) {
                    activeWidget.hidden = true;
                    activeWidget.computeSize = () => [0, 0];
                    activeWidget.draw = () => {};
                }

                while (this.inputs.length > 0) this.removeInput(this.inputs.length - 1);
                
                this.addInput("input_1", "*");
                this.addInput("input_2", "*");

                const infoWidget = {
                    name: "info_display",
                    value: "OFF",
                    type: "info_display",
                    draw: function(ctx, node, w, y, h) {
                        ctx.strokeStyle = this.value === "OFF" ? "#f44336" : "#4caf50";
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        if (ctx.roundRect) ctx.roundRect(1, y, w - 2, h, 6);
                        else ctx.rect(1, y, w - 2, h);
                        ctx.stroke();
                        ctx.fillStyle = "#fff";
                        ctx.font = "bold 13px Arial";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(this.value, w / 2, y + h / 2);
                    },
                    computeSize: function(width) { return [width, 25]; },
                    mouse: function() { return false; },
                    callback: function() {}
                };
                this.widgets.push(infoWidget);

                if (activeWidget && activeWidget.value !== "none") {
                    infoWidget.value = this.getActiveSlotDisplayName(activeWidget.value);
                }

                this.setSize(this.computeSize());
                this.size[0] = 350;
                this.setSize(this.size);
                
                this.defaultWidth = 350;
                
                this.setDirtyCanvas(true, true);
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                if (type !== 1) return;

                const activeWidget = this.widgets.find(w => w.name === "active_input");
                const infoWidget = this.widgets.find(w => w.name === "info_display");
                const inputName = this.inputs[index].name;
                const inputIndex = index + 1;

                if (connected) {
                    let targetNodeName = "Unknown";
                    if (link_info && link_info.origin_id) {
                        const originNode = app.graph.getNodeById(link_info.origin_id);
                        if (originNode) targetNodeName = originNode.getTitle() || originNode.type;
                    }
                    const prefix = `In ${inputIndex}: `;
                    let displayName = prefix + targetNodeName;
                    if (displayName.length > 35) displayName = prefix + targetNodeName.substring(0, 32) + "...";

                    let widget = this.widgets.find(w => w.slotName === inputName);
                    if (!widget) {
                        const connectedCount = this.inputs.filter(inp => inp.link !== null).length;
                        const isFirstSlot = connectedCount === 1;
                        widget = this.addWidget("toggle", displayName, isFirstSlot, (value) => {
                            if (value) {
                                if (activeWidget) activeWidget.value = widget.slotName;
                                if (infoWidget) infoWidget.value = this.getActiveSlotDisplayName(widget.slotName);
                                for (let w of this.widgets) {
                                    if (w !== widget && w.slotName && w.slotName.startsWith("input_")) {
                                        w.value = false;
                                    }
                                }
                            } else {
                                if (activeWidget) activeWidget.value = "none";
                                if (infoWidget) infoWidget.value = "OFF";
                            }
                            this.setDirtyCanvas(true, true);
                        }, {});
                        widget.slotName = inputName;
                        widget.draw = function(ctx, node, w, y, h) {
                            ctx.fillStyle = "#222";
                            ctx.fillRect(0, y, w, h);
                            ctx.fillStyle = "#aaa";
                            ctx.font = "14px Arial";
                            ctx.textAlign = "left";
                            ctx.fillText(this.name, 10, y + h / 2 + 1);
                            const toggleW = 30, toggleH = 14;
                            const toggleX = w - toggleW - 10;
                            const toggleY = y + (h - toggleH) / 2;
                            ctx.fillStyle = this.value ? "#4a4" : "#666";
                            ctx.beginPath();
                            ctx.arc(toggleX + toggleH / 2, toggleY + toggleH / 2, toggleH / 2, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillRect(toggleX + toggleH / 2, toggleY, toggleW - toggleH, toggleH);
                            ctx.beginPath();
                            ctx.arc(toggleX + toggleW - toggleH / 2, toggleY + toggleH / 2, toggleH / 2, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = "#fff";
                            ctx.beginPath();
                            ctx.arc(this.value ? toggleX + toggleW - toggleH / 2 : toggleX + toggleH / 2, toggleY + toggleH / 2, toggleH / 2 - 2, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = this.value ? "#4a4" : "#a44";
                            ctx.font = "bold 12px Arial";
                            ctx.textAlign = "right";
                            ctx.fillText(this.value ? "ON" : "OFF", toggleX - 5, y + h / 2 + 1);
                        };

                        const targetPos = inputIndex + 1;
                        const currentPos = this.widgets.indexOf(widget);
                        if (currentPos !== targetPos) {
                            this.widgets.splice(currentPos, 1);
                            this.widgets.splice(targetPos, 0, widget);
                        }

                        if (isFirstSlot && activeWidget) {
                            activeWidget.value = inputName;
                            if (infoWidget) infoWidget.value = this.getActiveSlotDisplayName(inputName);
                        }
                    } else {
                        widget.name = displayName;
                    }

                    const lastInput = this.inputs[this.inputs.length - 1];
                    const lastMatch = lastInput.name.match(/input_(\d+)/);
                    if (lastMatch && parseInt(lastMatch[1], 10) < 20 && index === this.inputs.length - 1) {
                        const newIndex = this.inputs.length + 1;
                        this.addInput(`input_${newIndex}`, "*");
                    }
                } else {
                    const widget = this.widgets.find(w => w.slotName === inputName);
                    if (widget) {
                        const wasActive = widget.value;
                        this.removeWidget(widget);
                        if (wasActive && activeWidget) {
                            activeWidget.value = "none";
                            if (infoWidget) infoWidget.value = "OFF";
                        }
                    }

                    if (this.inputs.length > 2) {
                        const hasConnected = this.inputs.some(inp => inp.link !== null);
                        if (!hasConnected) {
                            while (this.inputs.length > 2) {
                                this.removeInput(this.inputs.length - 1);
                            }
                        } else {
                            let lastConnectedIndex = -1;
                            for (let i = 0; i < this.inputs.length; i++) {
                                if (this.inputs[i].link !== null) {
                                    lastConnectedIndex = i;
                                }
                            }
                            const minSlots = Math.max(2, lastConnectedIndex + 2);
                            while (this.inputs.length > minSlots) {
                                this.removeInput(this.inputs.length - 1);
                            }
                        }
                    }
                }

                this.setSize(this.computeSize());
                this.size[0] = 350;
                this.setSize(this.size);
                this.setDirtyCanvas(true, true);
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(info) {
                if (onConfigure) onConfigure.apply(this, arguments);
                rebuildFromConnections.call(this);
                this.defaultWidth = 350;
            };

            const onResize = nodeType.prototype.onResize;
            nodeType.prototype.onResize = function(size) {
                if (onResize) onResize.apply(this, arguments);
                
                if (!this.defaultWidth) {
                    this.defaultWidth = 350;
                }
                
                if (size[0] < this.defaultWidth) {
                    size[0] = this.defaultWidth;
                    this.setSize(size);
                }
                
                return size;
            };

            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                if (onDrawForeground) onDrawForeground.apply(this, arguments);

                const btnW = 90, btnH = 20;
                const btnX = (this.size[0] - btnW) / 2;
                const btnY = 15;

                ctx.fillStyle = "#2a2a2a";
                ctx.strokeStyle = "#2196F3";
                ctx.lineWidth = 2;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(btnX, btnY, btnW, btnH, 6);
                } else {
                    ctx.moveTo(btnX + 6, btnY);
                    ctx.lineTo(btnX + btnW - 6, btnY);
                    ctx.quadraticCurveTo(btnX + btnW, btnY, btnX + btnW, btnY + 6);
                    ctx.lineTo(btnX + btnW, btnY + btnH - 6);
                    ctx.quadraticCurveTo(btnX + btnW, btnY + btnH, btnX + btnW - 6, btnY + btnH);
                    ctx.lineTo(btnX + 6, btnY + btnH);
                    ctx.quadraticCurveTo(btnX, btnY + btnH, btnX, btnY + btnH - 6);
                    ctx.lineTo(btnX, btnY + 6);
                    ctx.quadraticCurveTo(btnX, btnY, btnX + 6, btnY);
                    ctx.closePath();
                }
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = "#2196F3";
                ctx.font = "bold 10px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "alphabetic";
                ctx.fillText("UPDATE NAME", btnX + btnW / 2, btnY + btnH / 2 + 4);
            };

            const onMouseDown = nodeType.prototype.onMouseDown;
            nodeType.prototype.onMouseDown = function(event, pos, canvas) {
                if (onMouseDown) onMouseDown.apply(this, arguments);
                
                if (!pos) return false;
                
                const btnW = 90, btnH = 20;
                const btnX = (this.size[0] - btnW) / 2;
                const btnY = 15;

                if (pos[0] >= btnX && pos[0] <= btnX + btnW && pos[1] >= btnY && pos[1] <= btnY + btnH) {
                    updateSlotNames.call(this);
                    return true;
                }

                return false;
            };
        }
    }
});