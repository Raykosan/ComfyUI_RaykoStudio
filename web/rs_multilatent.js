import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RS.MultiLatent",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RS_Image_MultiLatent") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onConfigure = nodeType.prototype.onConfigure;

        nodeType.prototype.onNodeCreated = function() {
            const result = onNodeCreated ? onNodeCreated.apply(this) : undefined;
            initCustomPresets(this);

            const minWidth = 320;
            const minHeight = 340;
            const origOnResize = this.onResize;
            this.onResize = function(size) {
                if (size[0] < minWidth) size[0] = minWidth;
                if (size[1] < minHeight) size[1] = minHeight;
                if (origOnResize) {
                    origOnResize.apply(this, [size]);
                } else {
                    this.size = size;
                    this.setDirtyCanvas(true, true);
                }
            };
            return result;
        };

        nodeType.prototype.onConfigure = function(info) {
            const result = onConfigure ? onConfigure.apply(this, [info]) : undefined;
            queueMicrotask(() => {
                hideSystemWidgets(this);
                if (this.updatePresetUI) {
                    this.updatePresetUI();
                }
            });
            return result;
        };
    }
});

function hideSystemWidgets(node) {
    const wActive = node.widgets.find(w => w.name === "active_preset");
    const wStd = node.widgets.find(w => w.name === "preset_standard");
    const wQwen = node.widgets.find(w => w.name === "preset_qwen");
    const wMinimax = node.widgets.find(w => w.name === "preset_minimax");
    const wKrea = node.widgets.find(w => w.name === "preset_krea2");

    [wStd, wQwen, wMinimax, wKrea, wActive].forEach(w => {
        if (w) {
            w.type = "hidden";
            w.hidden = true;
            w.computeSize = () => [0, 0];
        }
    });
}

function setWidgetVisible(w, visible) {
    if (!w) return;
    if (!visible) {
        if (!w._rsOrig) {
            w._rsOrig = {
                type: w.type,
                computeSize: w.computeSize
            };
        }
        w.type = "hidden";
        w.hidden = true;
        w.computeSize = () => [0, 0];
    } else {
        w.hidden = false;
        if (w._rsOrig) {
            w.type = w._rsOrig.type;
            if (w._rsOrig.computeSize) {
                w.computeSize = w._rsOrig.computeSize;
            } else {
                delete w.computeSize;
            }
            delete w._rsOrig;
        } else {
            delete w.computeSize;
        }
    }
}

function saveNodeState(node) {
    const wActive = node.widgets.find(w => w.name === "active_preset");
    const wStd = node.widgets.find(w => w.name === "preset_standard");
    const wQwen = node.widgets.find(w => w.name === "preset_qwen");
    const wMinimax = node.widgets.find(w => w.name === "preset_minimax");
    const wKrea = node.widgets.find(w => w.name === "preset_krea2");

    if (wActive && wStd && wQwen && wMinimax && wKrea) {
        const state = {
            active: wActive.value,
            std: wStd.value,
            qwen: wQwen.value,
            minimax: wMinimax.value,
            krea: wKrea.value
        };
        try {
            localStorage.setItem(`rs_multilatent_${node.id}`, JSON.stringify(state));
        } catch (e) {}
    }
}

function loadNodeState(node) {
    try {
        const stateStr = localStorage.getItem(`rs_multilatent_${node.id}`);
        if (stateStr) {
            return JSON.parse(stateStr);
        }
    } catch (e) {}
    return null;
}

function parsePresetSize(str) {
    if (!str) return null;
    const m = String(str).match(/(\d+)\s*[×x]\s*(\d+)/);
    if (!m) return null;
    return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

function findMirror(values, w, h) {
    for (const v of values) {
        const p = parsePresetSize(v);
        if (p && p.w === h && p.h === w) return v;
    }
    return null;
}

function getMultipleValue(node) {
    const wMultiple = node.widgets.find(w => w.name === "multiple");
    if (!wMultiple) return 8;
    const parsed = parseInt(String(wMultiple.value).trim(), 10);
    return isNaN(parsed) || parsed <= 0 ? 8 : parsed;
}

function roundToMultiple(value, multiple, min = 8) {
    if (typeof value !== "number" || isNaN(value)) return min;
    const rounded = Math.round(value / multiple) * multiple;
    return Math.max(min, rounded);
}

function calculateMegapixels(megapixels, aspectRatio, multiple) {
    const parts = String(aspectRatio).split(":");
    if (parts.length !== 2) return { width: 0, height: 0 };
    const wRatio = parseInt(parts[0], 10);
    const hRatio = parseInt(parts[1], 10);
    if (!wRatio || !hRatio) return { width: 0, height: 0 };

    const m = Math.max(8, multiple);
    const targetPixels = megapixels * 1_000_000;
    const x = Math.sqrt(targetPixels / (wRatio * hRatio));
    const rawWidth = wRatio * x;
    const rawHeight = hRatio * x;
    const width = Math.max(m, Math.round(rawWidth / m) * m);
    const height = Math.max(m, Math.round(rawHeight / m) * m);
    return { width, height };
}

function handleSwap(node) {
    const wMode = node.widgets.find(w => w.name === "size_mode");
    const mode = wMode ? wMode.value : "Preset";

    if (mode === "Preset") {
        const wActive = node.widgets.find(w => w.name === "active_preset");
        if (!wActive) return;

        let activeWidget = null;
        if (wActive.value === "Standard") activeWidget = node.widgets.find(w => w.name === "preset_standard");
        else if (wActive.value === "Qwen") activeWidget = node.widgets.find(w => w.name === "preset_qwen");
        else if (wActive.value === "MiniMax") activeWidget = node.widgets.find(w => w.name === "preset_minimax");
        else if (wActive.value === "Krea2") activeWidget = node.widgets.find(w => w.name === "preset_krea2");

        if (!activeWidget || !activeWidget.options || !activeWidget.options.values) return;

        const p = parsePresetSize(activeWidget.value);
        if (!p || p.w === p.h) return;

        const mirror = findMirror(activeWidget.options.values, p.w, p.h);
        if (mirror) {
            activeWidget.value = mirror;
            if (node.updatePresetUI) node.updatePresetUI();
            saveNodeState(node);
            node.setDirtyCanvas(true, true);
        }
    } else if (mode === "Custom") {
        const wWidth = node.widgets.find(w => w.name === "width");
        const wHeight = node.widgets.find(w => w.name === "height");
        if (!wWidth || !wHeight) return;

        node._isSwapping = true;
        const tmp = wWidth.value;
        wWidth.value = wHeight.value;
        wHeight.value = tmp;
        node._isSwapping = false;

        const m = getMultipleValue(node);
        const minW = wWidth.options?.min || 8;
        const minH = wHeight.options?.min || 8;
        wWidth.value = roundToMultiple(wWidth.value, m, minW);
        wHeight.value = roundToMultiple(wHeight.value, m, minH);

        if (node.updatePresetUI) node.updatePresetUI();
        node.setDirtyCanvas(true, true);
    } else if (mode === "Megapixels") {
        const wAspect = node.widgets.find(w => w.name === "aspect_ratio");
        if (!wAspect || !wAspect.options || !wAspect.options.values) return;
        const parts = String(wAspect.value).split(":");
        if (parts.length !== 2 || parts[0] === parts[1]) return;
        const swapped = `${parts[1]}:${parts[0]}`;
        if (wAspect.options.values.includes(swapped)) {
            wAspect.value = swapped;
            if (node.updatePresetUI) node.updatePresetUI();
            node.setDirtyCanvas(true, true);
        }
    }
}

function setupMultipleRounding(node) {
    const wWidth = node.widgets.find(w => w.name === "width");
    const wHeight = node.widgets.find(w => w.name === "height");
    const wMultiple = node.widgets.find(w => w.name === "multiple");
    const wMode = node.widgets.find(w => w.name === "size_mode");

    if (!wWidth || !wHeight || !wMultiple) return;

    let isRounding = false;

    const roundWidth = () => {
        if (isRounding || node._isSwapping) return;
        if (!wMode || wMode.value !== "Custom") return;
        const m = getMultipleValue(node);
        const min = wWidth.options?.min || 8;
        const rounded = roundToMultiple(wWidth.value, m, min);
        if (rounded !== wWidth.value) {
            isRounding = true;
            wWidth.value = rounded;
            if (node.updatePresetUI) node.updatePresetUI();
            node.setDirtyCanvas(true, true);
            isRounding = false;
        } else {
            if (node.updatePresetUI) node.updatePresetUI();
        }
    };

    const roundHeight = () => {
        if (isRounding || node._isSwapping) return;
        if (!wMode || wMode.value !== "Custom") return;
        const m = getMultipleValue(node);
        const min = wHeight.options?.min || 8;
        const rounded = roundToMultiple(wHeight.value, m, min);
        if (rounded !== wHeight.value) {
            isRounding = true;
            wHeight.value = rounded;
            if (node.updatePresetUI) node.updatePresetUI();
            node.setDirtyCanvas(true, true);
            isRounding = false;
        } else {
            if (node.updatePresetUI) node.updatePresetUI();
        }
    };

    const origWidthCb = wWidth.callback;
    wWidth.callback = function(value) {
        if (origWidthCb) origWidthCb.apply(this, arguments);
        roundWidth();
    };

    const origHeightCb = wHeight.callback;
    wHeight.callback = function(value) {
        if (origHeightCb) origHeightCb.apply(this, arguments);
        roundHeight();
    };

    const origMultipleCb = wMultiple.callback;
    wMultiple.callback = function(value) {
        if (origMultipleCb) origMultipleCb.apply(this, arguments);
        if (wMode && wMode.value === "Custom") {
            const m = getMultipleValue(node);
            const minW = wWidth.options?.min || 8;
            const minH = wHeight.options?.min || 8;
            isRounding = true;
            wWidth.value = roundToMultiple(wWidth.value, m, minW);
            wHeight.value = roundToMultiple(wHeight.value, m, minH);
            node.setDirtyCanvas(true, true);
            isRounding = false;
        }
        if (node.updatePresetUI) node.updatePresetUI();
    };

    const bindInputEvents = (widget, handler) => {
        if (!widget || !widget.inputEl) return;
        widget.inputEl.addEventListener("change", handler);
        widget.inputEl.addEventListener("blur", handler);
    };

    queueMicrotask(() => {
        bindInputEvents(wWidth, roundWidth);
        bindInputEvents(wHeight, roundHeight);
    });
}

function initCustomPresets(node) {
    hideSystemWidgets(node);

    const wActive = node.widgets.find(w => w.name === "active_preset");
    const wStd = node.widgets.find(w => w.name === "preset_standard");
    const wQwen = node.widgets.find(w => w.name === "preset_qwen");
    const wMinimax = node.widgets.find(w => w.name === "preset_minimax");
    const wKrea = node.widgets.find(w => w.name === "preset_krea2");
    const wMode = node.widgets.find(w => w.name === "size_mode");
    const wMultiple = node.widgets.find(w => w.name === "multiple");
    const wWidth = node.widgets.find(w => w.name === "width");
    const wHeight = node.widgets.find(w => w.name === "height");
    const wMegapixels = node.widgets.find(w => w.name === "megapixels");
    const wAspect = node.widgets.find(w => w.name === "aspect_ratio");

    if (!wActive || !wStd || !wQwen || !wMinimax || !wKrea) return;

    const savedState = loadNodeState(node);
    if (savedState) {
        wActive.value = savedState.active || "Standard";
        wStd.value = savedState.std || wStd.value;
        wQwen.value = savedState.qwen || wQwen.value;
        wMinimax.value = savedState.minimax || wMinimax.value;
        wKrea.value = savedState.krea || wKrea.value;
    }

    if (wStd.value && String(wStd.value).startsWith("MiniMax")) {
        if (wMinimax.options && wMinimax.options.values.includes(wStd.value)) {
            wMinimax.value = wStd.value;
        }
        wStd.value = "Square - 1024x1024 (1:1)";
        wActive.value = "MiniMax";
        saveNodeState(node);
    }

    if (wActive.value === "Krea2") {
        wActive.value = "Standard";
        if (wKrea.value) wStd.value = wKrea.value;
        saveNodeState(node);
    }

    const updateMultipleVisibility = () => {
        if (!wMultiple) return;
        const mode = wMode ? wMode.value : "Preset";
        const show = (mode === "Custom" || mode === "Megapixels");
        setWidgetVisible(wMultiple, show);
    };

    const container = document.createElement("div");
    container.style.display = "none";
    container.style.flexDirection = "column";
    container.style.gap = "4px";
    container.style.padding = "4px 0 14px 0";
    container.style.width = "100%";

    const placeholderDiv = document.createElement("div");
    placeholderDiv.textContent = "SELECT A PRESET CATEGORY";
    placeholderDiv.style.textAlign = "center";
    placeholderDiv.style.fontSize = "10px";
    placeholderDiv.style.color = "#00FF00";
    placeholderDiv.style.padding = "2px 0";
    placeholderDiv.style.fontWeight = "bold";

    const buttonsContainer = document.createElement("div");
    buttonsContainer.style.display = "flex";
    buttonsContainer.style.gap = "6px";
    buttonsContainer.style.width = "100%";

    const infoDiv = document.createElement("div");
    infoDiv.style.textAlign = "center";
    infoDiv.style.padding = "6px 8px";
    infoDiv.style.backgroundColor = "rgba(74, 158, 255, 0.1)";
    infoDiv.style.borderRadius = "4px";
    infoDiv.style.fontSize = "11px";
    infoDiv.style.color = "#aaa";
    infoDiv.style.fontWeight = "500";
    infoDiv.style.wordWrap = "break-word";
    infoDiv.style.overflowWrap = "break-word";
    infoDiv.style.lineHeight = "1.3";

    const lists = [
        { id: "Standard", w: wStd, label: "STANDARD", color: "#4a9eff" },
        { id: "Qwen", w: wQwen, label: "QWEN", color: "#ff6b4a" },
        { id: "MiniMax", w: wMinimax, label: "MINIMAX", color: "#a855f7" }
    ];

    let currentOpen = null;
    const buttons = [];

    document.addEventListener("click", (e) => {
        if (currentOpen && !container.contains(e.target)) {
            currentOpen.remove();
            currentOpen = null;
        }
    });

    const updateInfo = () => {
        const mode = wMode ? wMode.value : "Preset";

        if (mode === "Preset") {
            const activeList = lists.find(l => l.id === wActive.value);
            const presetValue = activeList ? activeList.w.value : "Not selected";
            const presetMatch = presetValue.match(/^(?:(\d+K)\s+)?(Square|Portrait|Landscape)\s*-\s*(\d+)\s*[×x]\s*(\d+)\s*(\([^)]+\))?$/);

            let infoText = "";
            if (presetMatch) {
                const prefix = presetMatch[1] ? `${presetMatch[1]} ` : "";
                const orientation = presetMatch[2];
                const width = presetMatch[3];
                const height = presetMatch[4];
                const aspect = presetMatch[5] ? ` ${presetMatch[5]}` : "";
                infoText = `${prefix}${orientation} - ${width}×${height}${aspect} — ${activeList ? activeList.label : ""}`;
            } else {
                infoText = presetValue;
            }

            infoDiv.textContent = infoText;
            if (activeList) {
                infoDiv.style.backgroundColor = `${activeList.color}15`;
                infoDiv.style.color = activeList.color;
            }
        } else if (mode === "Custom") {
            const m = getMultipleValue(node);
            const minW = wWidth ? (wWidth.options?.min || 8) : 8;
            const minH = wHeight ? (wHeight.options?.min || 8) : 8;
            const effective = Math.max(8, m);
            const w = wWidth ? roundToMultiple(wWidth.value, effective, minW) : 1024;
            const h = wHeight ? roundToMultiple(wHeight.value, effective, minH) : 1024;

            infoDiv.textContent = `${w} × ${h} • mult: ${effective}`;
            infoDiv.style.backgroundColor = "rgba(74, 255, 158, 0.12)";
            infoDiv.style.color = "#4aff9e";
        } else if (mode === "Megapixels") {
            const mp = wMegapixels ? wMegapixels.value : 1.0;
            const aspect = wAspect ? wAspect.value : "1:1";
            const m = getMultipleValue(node);
            const { width, height } = calculateMegapixels(mp, aspect, m);

            infoDiv.textContent = `${mp} MP → ${width}×${height} (${aspect}) • mult: ${Math.max(8, m)}`;
            infoDiv.style.backgroundColor = "rgba(255, 204, 74, 0.15)";
            infoDiv.style.color = "#ffcc4a";
        }
    };

    lists.forEach(list => {
        const wrapper = document.createElement("div");
        wrapper.style.flex = "1";
        wrapper.style.position = "relative";

        const btn = document.createElement("button");
        btn.textContent = list.label;
        btn.style.width = "100%";
        btn.style.padding = "6px 2px";
        btn.style.borderRadius = "4px";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "9px";
        btn.style.textAlign = "center";
        btn.style.overflow = "hidden";
        btn.style.textOverflow = "ellipsis";
        btn.style.whiteSpace = "nowrap";
        btn.style.transition = "all 0.15s";

        btn.onclick = (e) => {
            e.stopPropagation();
            if (currentOpen) { currentOpen.remove(); currentOpen = null; }
            wActive.value = list.id;
            updateAllButtons();
            updateInfo();
            saveNodeState(node);
            node.setDirtyCanvas(true, true);

            const dropdown = document.createElement("div");
            dropdown.style.position = "absolute";
            dropdown.style.left = "0";
            dropdown.style.width = "240px";
            dropdown.style.maxHeight = "250px";
            dropdown.style.overflowY = "auto";
            dropdown.style.backgroundColor = "#1a1a1a";
            dropdown.style.border = `1px solid ${list.color}`;
            dropdown.style.borderRadius = "4px";
            dropdown.style.boxShadow = "0 4px 12px rgba(0,0,0,0.8)";
            dropdown.style.zIndex = "9999";
            dropdown.style.fontSize = "11px";

            const btnRect = btn.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            const spaceBelow = windowHeight - btnRect.bottom;
            const spaceAbove = btnRect.top;

            if (spaceBelow < 250 && spaceAbove > spaceBelow) {
                dropdown.style.bottom = "100%";
                dropdown.style.marginBottom = "4px";
                dropdown.style.maxHeight = `${Math.min(250, spaceAbove - 20)}px`;
            } else {
                dropdown.style.top = "100%";
                dropdown.style.marginTop = "4px";
            }

            list.w.options.values.forEach(opt => {
                const item = document.createElement("div");
                item.textContent = opt;
                item.style.padding = "6px 8px";
                item.style.cursor = "pointer";
                item.style.color = "#ddd";
                item.style.borderBottom = "1px solid #2a2a2a";
                item.style.whiteSpace = "nowrap";
                item.style.overflow = "hidden";
                item.style.textOverflow = "ellipsis";

                item.onmouseenter = () => item.style.backgroundColor = "#333";
                item.onmouseleave = () => item.style.backgroundColor = "transparent";

                item.onclick = (ev) => {
                    ev.stopPropagation();
                    list.w.value = opt;
                    dropdown.remove();
                    currentOpen = null;
                    updateAllButtons();
                    updateInfo();
                    saveNodeState(node);
                    node.setDirtyCanvas(true, true);
                };

                dropdown.appendChild(item);
            });

            wrapper.appendChild(dropdown);
            currentOpen = dropdown;
        };

        wrapper.appendChild(btn);
        buttonsContainer.appendChild(wrapper);
        buttons.push({ btn, list });
    });

    const swapWrapper = document.createElement("div");
    swapWrapper.style.flex = "1";
    swapWrapper.style.position = "relative";

    const swapBtn = document.createElement("button");
    swapBtn.textContent = "⇄ SWAP";
    swapBtn.title = "Swap width and height (works in all size modes)";
    swapBtn.style.width = "100%";
    swapBtn.style.padding = "6px 2px";
    swapBtn.style.borderRadius = "4px";
    swapBtn.style.cursor = "pointer";
    swapBtn.style.fontSize = "9px";
    swapBtn.style.textAlign = "center";
    swapBtn.style.overflow = "hidden";
    swapBtn.style.textOverflow = "ellipsis";
    swapBtn.style.whiteSpace = "nowrap";
    swapBtn.style.transition = "all 0.15s";
    swapBtn.style.border = "2px solid #4aff9e";
    swapBtn.style.backgroundColor = "#4aff9e22";
    swapBtn.style.color = "#fff";
    swapBtn.style.fontWeight = "bold";
    swapBtn._flashing = false;

    swapBtn.onmouseenter = () => {
        if (!swapBtn._flashing) swapBtn.style.backgroundColor = "#4aff9e44";
    };
    swapBtn.onmouseleave = () => {
        if (!swapBtn._flashing) swapBtn.style.backgroundColor = "#4aff9e22";
    };

    swapBtn.onclick = (e) => {
        e.stopPropagation();
        if (currentOpen) { currentOpen.remove(); currentOpen = null; }
        handleSwap(node);
        swapBtn._flashing = true;
        swapBtn.style.backgroundColor = "#4aff9e77";
        setTimeout(() => {
            swapBtn._flashing = false;
            swapBtn.style.backgroundColor = swapBtn.matches(":hover") ? "#4aff9e44" : "#4aff9e22";
        }, 150);
    };

    swapWrapper.appendChild(swapBtn);
    buttonsContainer.appendChild(swapWrapper);

    const updateAllButtons = () => {
        buttons.forEach(({ btn, list }) => {
            const isActive = wActive.value === list.id;
            btn.style.border = `2px solid ${isActive ? list.color : "#555"}`;
            btn.style.backgroundColor = isActive ? `${list.color}22` : "#1e1e1e";
            btn.style.color = isActive ? "#fff" : "#777";
            btn.style.fontWeight = isActive ? "bold" : "normal";
            btn.title = list.w.value;
        });
    };

    node.updatePresetUI = () => {
        updateAllButtons();
        updateInfo();
        updateMultipleVisibility();
        if (container.style.display === "none") {
            container.style.display = "flex";
        }
    };

    updateAllButtons();
    updateInfo();

    container.appendChild(placeholderDiv);
    container.appendChild(buttonsContainer);
    container.appendChild(infoDiv);

    node.addDOMWidget("preset_ui", "preset_ui", container, {
        serialize: false,
        hideOnZoom: false,
        computeSize: () => [node.size[0] - 20, 80]
    });

    const originalCallback = wActive.callback;
    wActive.callback = function(value) {
        if (originalCallback) originalCallback.apply(this, arguments);
        updateAllButtons();
        updateInfo();
        saveNodeState(node);
    };

    if (wMode) {
        const origModeCallback = wMode.callback;
        wMode.callback = function(value) {
            if (origModeCallback) origModeCallback.apply(this, arguments);
            updateMultipleVisibility();
            updateInfo();
        };
    }

    if (wMegapixels) {
        const origMpCb = wMegapixels.callback;
        wMegapixels.callback = function(value) {
            if (origMpCb) origMpCb.apply(this, arguments);
            updateInfo();
        };
        queueMicrotask(() => {
            if (wMegapixels.inputEl) {
                wMegapixels.inputEl.addEventListener("change", () => updateInfo());
                wMegapixels.inputEl.addEventListener("blur", () => updateInfo());
            }
        });
    }

    if (wAspect) {
        const origAspectCb = wAspect.callback;
        wAspect.callback = function(value) {
            if (origAspectCb) origAspectCb.apply(this, arguments);
            updateInfo();
        };
    }

    setupMultipleRounding(node);

    container.style.display = "flex";
    node.size = [320, 320];
    updateMultipleVisibility();
}

document.addEventListener("visibilitychange", () => {
    if (!document.hidden && app && app.graph) {
        queueMicrotask(() => {
            app.graph._nodes.forEach(node => {
                if (node.type === "RS_Image_MultiLatent" && node.updatePresetUI) {
                    node.updatePresetUI();
                }
            });
        });
    }
});

window.addEventListener("focus", () => {
    if (app && app.graph) {
        queueMicrotask(() => {
            app.graph._nodes.forEach(node => {
                if (node.type === "RS_Image_MultiLatent" && node.updatePresetUI) {
                    node.updatePresetUI();
                }
            });
        });
    }
});