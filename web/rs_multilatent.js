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
            
            const minWidth = 260;
            const minHeight = 310;
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
    const wKrea = node.widgets.find(w => w.name === "preset_krea2");
    
    [wStd, wQwen, wKrea, wActive].forEach(w => {
        if (w) {
            w.type = "hidden";
            w.hidden = true;
            w.computeSize = () => [0, 0];
        }
    });
}

function saveNodeState(node) {
    const wActive = node.widgets.find(w => w.name === "active_preset");
    const wStd = node.widgets.find(w => w.name === "preset_standard");
    const wQwen = node.widgets.find(w => w.name === "preset_qwen");
    const wKrea = node.widgets.find(w => w.name === "preset_krea2");
    
    if (wActive && wStd && wQwen && wKrea) {
        const state = {
            active: wActive.value,
            std: wStd.value,
            qwen: wQwen.value,
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

function initCustomPresets(node) {
    hideSystemWidgets(node);
    
    const wActive = node.widgets.find(w => w.name === "active_preset");
    const wStd = node.widgets.find(w => w.name === "preset_standard");
    const wQwen = node.widgets.find(w => w.name === "preset_qwen");
    const wKrea = node.widgets.find(w => w.name === "preset_krea2");
    
    if (!wActive || !wStd || !wQwen || !wKrea) return;

    const savedState = loadNodeState(node);
    if (savedState) {
        wActive.value = savedState.active;
        wStd.value = savedState.std;
        wQwen.value = savedState.qwen;
        wKrea.value = savedState.krea;
    }

    const container = document.createElement("div");
    container.style.display = "none";
    container.style.flexDirection = "column";
    container.style.gap = "4px";
    container.style.padding = "4px 0";
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
    buttonsContainer.style.gap = "8px";
    buttonsContainer.style.width = "100%";

    const infoDiv = document.createElement("div");
    infoDiv.style.textAlign = "center";
    infoDiv.style.padding = "6px 8px";
    infoDiv.style.backgroundColor = "rgba(74, 158, 255, 0.1)";
    infoDiv.style.borderRadius = "4px";
    infoDiv.style.fontSize = "11px";
    infoDiv.style.color = "#aaa";
    infoDiv.style.fontWeight = "500";

    const lists = [
        { id: "Standard", w: wStd, label: "STANDARD", color: "#4a9eff" },
        { id: "Qwen", w: wQwen, label: "QWEN", color: "#ff6b4a" },
        { id: "Krea2", w: wKrea, label: "KREA2", color: "#4aff9e" }
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
        const activeList = lists.find(l => l.id === wActive.value);
        const presetValue = activeList ? activeList.w.value : "Not selected";
        
        const orientationMatch = presetValue.match(/^(Square|Portrait|Landscape)\s*-\s*/);
        const sizeMatch = presetValue.match(/(\d+)\s*[×x]\s*(\d+)/);
        const aspectMatch = presetValue.match(/\(([^)]+)\)$/);
        
        let infoText = "";
        if (orientationMatch && sizeMatch) {
            const orientation = orientationMatch[1];
            const width = sizeMatch[1];
            const height = sizeMatch[2];
            const aspect = aspectMatch ? ` ${aspectMatch[1]}` : "";
            infoText = `${orientation} - ${width}×${height}${aspect} — ${activeList ? activeList.label : ""}`;
        } else {
            infoText = presetValue;
        }
        
        infoDiv.textContent = infoText;
        if (activeList) {
            infoDiv.style.backgroundColor = `${activeList.color}15`;
            infoDiv.style.color = activeList.color;
        }
    };

    lists.forEach(list => {
        const wrapper = document.createElement("div");
        wrapper.style.flex = "1";
        wrapper.style.position = "relative";

        const btn = document.createElement("button");
        btn.textContent = list.label;
        btn.style.width = "100%";
        btn.style.padding = "6px 4px";
        btn.style.borderRadius = "4px";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "10px";
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
            dropdown.style.width = "220px";
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
        computeSize: () => [node.size[0] - 20, 70]
    });

    const originalCallback = wActive.callback;
    wActive.callback = function(value) {
        if (originalCallback) originalCallback.apply(this, arguments);
        updateAllButtons();
        updateInfo();
        saveNodeState(node);
    };

    container.style.display = "flex";
    node.size = [260, 310];
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