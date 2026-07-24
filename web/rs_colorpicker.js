import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_CLASS = "RSColorPicker";
const NODE_W = 200;
const NODE_H = 300;
const PRESETS = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#ffffff", "#000000"];

function mkEl(tag, css, extra) {
    const el = document.createElement(tag);
    if (css) el.style.cssText = css;
    if (extra) Object.assign(el, extra);
    return el;
}

function hexToInt(hex) {
    return parseInt(hex.replace('#', '').slice(0, 6), 16);
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToRGB(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    else if (h.length > 6) h = h.slice(0, 6);
    return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255
    };
}

function normalizeHex(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    else if (h.length > 6) h = h.slice(0, 6);
    else if (h.length < 6) h = h.padEnd(6, '0');
    return '#' + h;
}

function showRaykoToast(message, type = "success", node = null) {
    const existingToast = document.getElementById("rayko-toast");
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement("div");
    toast.id = "rayko-toast";
    
    const bgColor = type === "success" ? "#2a3a2a" : "#3a2a2a";
    const borderColor = type === "success" ? "#4CAF50" : "#f44336";
    const textColor = type === "success" ? "#aaffaa" : "#ffaaaa";
    
    toast.style.cssText = `
        position: fixed;
        background: ${bgColor};
        border: 2px solid ${borderColor};
        border-radius: 6px;
        padding: 10px 20px;
        color: ${textColor};
        font-size: 13px;
        font-weight: bold;
        z-index: 10002;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
    `;
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    let posX, posY;
    if (node && node.pos && node.size) {
        const canvasRect = app.canvas.canvas.getBoundingClientRect();
        const scale = app.canvas.ds.scale;
        const offset = app.canvas.ds.offset;
        
        const nodeScreenX = canvasRect.left + (node.pos[0] + offset[0]) * scale;
        const nodeScreenY = canvasRect.top + (node.pos[1] + offset[1]) * scale;
        const nodeScreenW = node.size[0] * scale;
        const nodeScreenH = node.size[1] * scale;
        
        posX = nodeScreenX + nodeScreenW / 2;
        posY = nodeScreenY + nodeScreenH / 2;
    } else {
        posX = window.innerWidth / 2;
        posY = window.innerHeight / 2;
    }
    
    toast.style.left = posX + "px";
    toast.style.top = posY + "px";
    toast.style.transform = "translate(-50%, -50%)";
    
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
    });
    
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, 1500);
}

const cursorStyle = document.createElement('style');
cursorStyle.textContent = `
    body.eyedropper-active,
    body.eyedropper-active *,
    body.eyedropper-active #graph-canvas,
    body.eyedropper-active .graph-canvas-container canvas,
    body.eyedropper-active .litegraph canvas,
    body.eyedropper-active .litegraph .node,
    body.eyedropper-active .litegraph .node *,
    body.eyedropper-active .drag-and-drop,
    body.eyedropper-active .comfy-menu,
    body.eyedropper-active .comfy-menu * {
        cursor: crosshair !important;
    }
`;
document.head.appendChild(cursorStyle);

class CanvasEyedropper {
    constructor() {
        this.active = false;
        this.lastColor = null;
        this.rafId = null;
        this.magnifier = this._createMagnifier();
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
    }
    
    _createMagnifier() {
        const el = mkEl("div", "position:fixed;pointer-events:none;z-index:99999;width:80px;height:80px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #000,0 4px 12px rgba(0,0,0,0.5);overflow:hidden;display:none;");
        const canvas = mkEl("canvas", "");
        canvas.width = 80;
        canvas.height = 80;
        canvas.style.cssText = "width:80px;height:80px;image-rendering:pixelated;display:block;";
        const label = mkEl("div", "position:absolute;bottom:-24px;left:50%;transform:translateX(-50%);background:#000;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-family:monospace;white-space:nowrap;");
        el.append(canvas, label);
        document.body.append(el);
        this.magCanvas = canvas;
        this.magCtx = canvas.getContext('2d', { willReadFrequently: true });
        this.magLabel = label;
        return el;
    }
    
    start(onPick, buttonRect) {
        this.active = true;
        this.onPick = onPick;
        document.body.classList.add('eyedropper-active');
        if (buttonRect) {
            this.magnifier.style.left = (buttonRect.right + 10) + 'px';
            this.magnifier.style.top = buttonRect.top + 'px';
        }
        this.magnifier.style.display = 'block';
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('click', this._onClick, true);
        document.addEventListener('keydown', this._onKeyDown);
    }
    
    stop() {
        this.active = false;
        document.body.classList.remove('eyedropper-active');
        this.magnifier.style.display = 'none';
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('click', this._onClick, true);
        document.removeEventListener('keydown', this._onKeyDown);
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
    
    _getColorAt(x, y) {
        this.magnifier.style.display = 'none';
        const el = document.elementFromPoint(x, y);
        if (!el || this.magnifier.contains(el)) {
            this.magnifier.style.display = 'block';
            return null;
        }
        let canvas = el.tagName === 'CANVAS' ? el : el.querySelector('canvas');
        if (!canvas) {
            let parent = el.parentElement;
            while (parent) {
                canvas = parent.querySelector('canvas');
                if (canvas) break;
                parent = parent.parentElement;
            }
        }
        this.magnifier.style.display = 'block';
        if (!canvas) return null;
        
        const rect = canvas.getBoundingClientRect();
        const px = (x - rect.left) * (canvas.width / rect.width);
        const py = (y - rect.top) * (canvas.height / rect.height);
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;
        
        try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const pixel = ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data;
            return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
        } catch (e) {
            return null;
        }
    }
    
    _drawMagnifier(x, y, color) {
        this.magCtx.clearRect(0, 0, 80, 80);
        this.magCtx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
        this.magCtx.fillRect(0, 0, 80, 80);
        this.magCtx.strokeStyle = 'rgba(255,255,255,0.3)';
        this.magCtx.lineWidth = 1;
        for (let i = 0; i <= 80; i += 10) {
            this.magCtx.beginPath();
            this.magCtx.moveTo(i, 0); this.magCtx.lineTo(i, 80);
            this.magCtx.moveTo(0, i); this.magCtx.lineTo(80, i);
            this.magCtx.stroke();
        }
        this.magCtx.strokeStyle = '#fff';
        this.magCtx.lineWidth = 1;
        this.magCtx.strokeRect(35.5, 35.5, 9, 9);
        const hex = rgbToHex(color.r, color.g, color.b);
        this.magLabel.textContent = hex;
        this.magnifier.style.left = (x + 10) + 'px';
        this.magnifier.style.top = (y + 10) + 'px';
    }
    
    _onMouseMove(e) {
        if (this.rafId) return;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            const color = this._getColorAt(e.clientX, e.clientY);
            if (color) {
                this.lastColor = color;
                this._drawMagnifier(e.clientX, e.clientY, color);
            } else if (this.lastColor) {
                this._drawMagnifier(e.clientX, e.clientY, this.lastColor);
            }
        });
    }
    
    _onClick(e) {
        e.preventDefault();
        e.stopPropagation();
        const color = this._getColorAt(e.clientX, e.clientY);
        this.stop();
        if (color && this.onPick) {
            this.onPick(rgbToHex(color.r, color.g, color.b));
        }
    }
    
    _onKeyDown(e) {
        if (e.key === 'Escape') this.stop();
    }
}

const canvasEyedropper = new CanvasEyedropper();

app.registerExtension({
    name: "RSColorPicker",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        
        nodeType.output = ["INT", "STRING", "STRING"];
        nodeType.output_name = ["HEX_INT", "HEX_STR", "RGB"];
        
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function () {
            const result = origOnNodeCreated?.apply(this, arguments);
            const node = this;
            
            node.computeSize = () => [NODE_W, NODE_H];
            node.setSize([NODE_W, NODE_H]);
            
            node.data = {
                color: "#ff0000",
                history: []
            };
            
            const hiddenWidget = node.widgets?.find(w => w.name === "node_data");
            if (hiddenWidget) {
                hiddenWidget.hidden = true;
                hiddenWidget.tooltip = "";
                hiddenWidget.type = "hidden";
                
                if (hiddenWidget.element) {
                    hiddenWidget.element.style.display = "none";
                    hiddenWidget.element.style.pointerEvents = "none";
                }
                
                try {
                    const savedData = JSON.parse(hiddenWidget.value || "{}");
                    if (savedData && typeof savedData === 'object') {
                        node.data = {
                            ...node.data,
                            ...savedData,
                            history: savedData.history || []
                        };
                    }
                } catch (e) {}
                
                hiddenWidget.serializeValue = () => {
                    node.syncData();
                    return JSON.stringify(node.data);
                };
            }
            
            node.syncData = function() {
                if (hiddenWidget) {
                    hiddenWidget.value = JSON.stringify(node.data);
                }
                if (node.graph) {
                    node.graph.changeTracker?.dispatchEvent(new Event("change"));
                }
            };
            
            node.updateUI = function() {
                node.syncData();
                if (node.graph) {
                    node.graph.setDirtyCanvas(true, true);
                    node.graph.changeTracker?.dispatchEvent(new Event("change"));
                }
            };
            
            const colorWidget = node.widgets?.find(w => w.name === "color");
            if (colorWidget) {
                colorWidget.hidden = true;
                colorWidget.computeSize = () => [0, 0];
            }
            
            const root = mkEl("div", "display:flex;flex-direction:column;gap:4px;padding:2px;overflow:hidden;");
            
            const basicLabel = mkEl("div", "color:#999;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;padding-left:2px;", { textContent: "Basic Colors" });
            
            const presetsRow = mkEl("div", "display:flex;gap:3px;flex-wrap:wrap;");
            PRESETS.forEach(color => {
                const btn = mkEl("div", `width:19px;height:19px;border-radius:3px;background:${color};cursor:pointer;border:1px solid #333;transition:transform 0.1s;`);
                btn.onmouseenter = () => btn.style.transform = "scale(1.2)";
                btn.onmouseleave = () => btn.style.transform = "scale(1)";
                btn.onclick = () => syncOutputs(color);
                presetsRow.append(btn);
            });
            
            const topRow = mkEl("div", "display:flex;gap:4px;align-items:center;margin-top:5px;");
            
            const swatch = mkEl("div", "width:36px;height:36px;border-radius:4px;border:2px solid #444;cursor:pointer;flex-shrink:0;transition:border-color 0.1s;");
            swatch.onmouseenter = () => swatch.style.borderColor = "#6688aa";
            swatch.onmouseleave = () => swatch.style.borderColor = "#444";
            
            const colorInput = mkEl("input", "width:0;height:0;opacity:0;position:absolute;", { type: "color" });
            
            const hexInput = mkEl("input", "width:10ch;padding:4px 6px;background:#1e1e1e;color:#ccc;border:1px solid #444;border-radius:4px;font-family:monospace;font-size:12px;flex-shrink:0;box-sizing:border-box;");
            
            const copyBtn = mkEl("button", "width:24px;height:24px;border-radius:3px;border:1px solid #444;background:#2a2a2a;color:#ccc;cursor:pointer;flex-shrink:0;transition:all 0.1s;display:flex;align-items:center;justify-content:center;padding:0;", {
                innerHTML: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
                title: "Copy HEX"
            });
            copyBtn.onmouseenter = () => { copyBtn.style.borderColor = "#6688aa"; copyBtn.style.background = "#3a3a3a"; };
            copyBtn.onmouseleave = () => { copyBtn.style.borderColor = "#444"; copyBtn.style.background = "#2a2a2a"; };
            
            copyBtn.onclick = () => {
                const hexValue = hexInput.value;
                navigator.clipboard.writeText(hexValue).then(() => {
                    showRaykoToast(`Copied: "${hexValue}"`, "success", node);
                }).catch(() => {
                    showRaykoToast("Failed to copy", "error", node);
                });
            };
            
            const eyedropperBtn = mkEl("button", "width:36px;height:36px;border-radius:4px;border:2px solid #444;background:#2a2a2a;color:#ccc;cursor:pointer;font-size:14px;flex-shrink:0;transition:all 0.1s;", { 
                innerHTML: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`,
                title: "Color Palette" 
            });
            eyedropperBtn.onmouseenter = () => { eyedropperBtn.style.borderColor = "#6688aa"; eyedropperBtn.style.background = "#3a3a3a"; };
            eyedropperBtn.onmouseleave = () => { eyedropperBtn.style.borderColor = "#444"; eyedropperBtn.style.background = "#2a2a2a"; };
            
            eyedropperBtn.onclick = async () => {
                if ('EyeDropper' in window) {
                    try {
                        const eyeDropper = new EyeDropper();
                        const result = await eyeDropper.open();
                        syncOutputs(result.sRGBHex);
                        return;
                    } catch (e) { return; }
                }
                const rect = eyedropperBtn.getBoundingClientRect();
                canvasEyedropper.start((hex) => syncOutputs(hex), rect);
            };
            
            swatch.onclick = () => colorInput.click();
            swatch.ondblclick = () => {
                navigator.clipboard.writeText(hexInput.value.toUpperCase());
                swatch.style.borderColor = "#50cc50";
                setTimeout(() => swatch.style.borderColor = "#444", 300);
            };
            
            topRow.append(swatch, colorInput, hexInput, copyBtn, eyedropperBtn);
            
            const presetToolbar = mkEl("div", "display:flex;gap:4px;margin-top:5px;");
            
            const savePresetBtn = mkEl("button", "flex:1;padding:6px 2px;font-size:11px;border:1px solid #4CAF50;border-radius:5px;background:#1a3a1a;color:#aaffaa;cursor:pointer;", { textContent: "💾 Save" });
            savePresetBtn.onmouseenter = () => { savePresetBtn.style.background = "#2a4a2a"; };
            savePresetBtn.onmouseleave = () => { savePresetBtn.style.background = "#1a3a1a"; };
            
            const loadPresetBtn = mkEl("button", "flex:1;padding:6px 2px;font-size:11px;border:1px solid #2196F3;border-radius:5px;background:#1a2a3a;color:#aaddff;cursor:pointer;", { textContent: "📂 Load" });
            loadPresetBtn.onmouseenter = () => { loadPresetBtn.style.background = "#2a3a4a"; };
            loadPresetBtn.onmouseleave = () => { loadPresetBtn.style.background = "#1a2a3a"; };
            
            presetToolbar.append(savePresetBtn, loadPresetBtn);
            
            const recentHeader = mkEl("div", "display:flex;justify-content:space-between;align-items:center;margin-top:5px;");
            const recentLabel = mkEl("div", "color:#999;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;padding-left:2px;", { textContent: "Recent Colors" });
            const clearAllBtn = mkEl("button", "padding:1px 6px;font-size:9px;border:1px solid #f44336;border-radius:4px;background:#353535;color:#ffaaaa;cursor:pointer;transition:background 0.1s;", { textContent: "❌ Clear All" });
            clearAllBtn.onmouseenter = () => { clearAllBtn.style.background = "#4a2a2a"; };
            clearAllBtn.onmouseleave = () => { clearAllBtn.style.background = "#353535"; };
            clearAllBtn.onclick = (e) => {
                e.stopPropagation();
                if (node.data.history.length === 0) return;
                node.data.history = [];
                updateHistoryUI();
                node.updateUI();
                showRaykoToast("History cleared", "success", node);
            };
            recentHeader.append(recentLabel, clearAllBtn);
            
            const historyRow = mkEl("div", "display:flex;gap:3px;flex-wrap:wrap;");
            
            const showDeleteColorPopup = (e, color) => {
                const existingPopup = document.getElementById("rs-colorpicker-delete-color-popup");
                if (existingPopup) existingPopup.remove();
                
                const popup = mkEl("div", "position:fixed;background:#2a2a2a;padding:6px 10px;border:1px solid #f44336;border-radius:4px;z-index:10003;box-shadow:0 2px 10px rgba(0,0,0,0.5);");
                popup.id = "rs-colorpicker-delete-color-popup";
                
                const btn = mkEl("button", "padding:4px 10px;font-size:11px;background:#3a1a1a;color:#ffaaaa;border:1px solid #f44336;border-radius:3px;cursor:pointer;transition:background 0.1s;", { textContent: "Delete" });
                btn.onmouseenter = () => { btn.style.background = "#4a2a2a"; };
                btn.onmouseleave = () => { btn.style.background = "#3a1a1a"; };
                btn.onclick = (ev) => {
                    ev.stopPropagation();
                    node.data.history = node.data.history.filter(c => c !== color);
                    updateHistoryUI();
                    node.updateUI();
                    popup.remove();
                    document.removeEventListener("pointerdown", closePopup, true);
                    showRaykoToast("Color removed", "success", node);
                };
                
                popup.appendChild(btn);
                popup.style.left = e.clientX + "px";
                popup.style.top = e.clientY + "px";
                
                document.body.appendChild(popup);
                
                const clickTime = Date.now();
                const closePopup = (ev) => {
                    if (Date.now() - clickTime < 200) return;
                    if (!popup.contains(ev.target)) {
                        popup.remove();
                        document.removeEventListener("pointerdown", closePopup, true);
                    }
                };
                
                setTimeout(() => {
                    document.addEventListener("pointerdown", closePopup, true);
                }, 50);
            };
            
            let updateHistoryUI = () => {
                historyRow.innerHTML = '';
                (node.data.history || []).forEach(color => {
                    const btn = mkEl("div", `width:19px;height:19px;border-radius:3px;background:${color};cursor:pointer;border:1px solid #333;transition:transform 0.1s;`);
                    btn.onmouseenter = () => btn.style.transform = "scale(1.2)";
                    btn.onmouseleave = () => btn.style.transform = "scale(1)";
                    btn.onclick = () => syncOutputs(color);
                    btn.oncontextmenu = (e) => {
                        e.preventDefault();
                        showDeleteColorPopup(e, color);
                    };
                    historyRow.append(btn);
                });
            };
            
            root.append(basicLabel, presetsRow, topRow, presetToolbar, recentHeader, historyRow);
            
            const syncOutputs = (color) => {
                const normalized = normalizeHex(color);
                node.data.color = normalized;
                
                if (colorWidget) colorWidget.value = normalized;
                
                swatch.style.background = normalized;
                colorInput.value = normalized;
                hexInput.value = normalized.toUpperCase();
                
                const rgb = hexToRGB(normalized);
                if (node.outputs) {
                    node.outputs[0].value = hexToInt(normalized);
                    node.outputs[1].value = normalized.toUpperCase();
                    node.outputs[2].value = `${rgb.r.toFixed(3)}, ${rgb.g.toFixed(3)}, ${rgb.b.toFixed(3)}`;
                }
                
                const history = node.data.history || [];
                const filtered = history.filter(c => c !== normalized);
                filtered.unshift(normalized);
                node.data.history = filtered.slice(0, 24);
                
                updateHistoryUI();
                node.updateUI();
            };
            
            const showSavePresetDialog = (e) => {
                const existingDialog = document.getElementById("rs-colorpicker-save-dialog");
                if (existingDialog) existingDialog.remove();
                
                const dialog = mkEl("div", "position:fixed;background:#2a2a2a;padding:10px;border:1px solid #4CAF50;border-radius:6px;z-index:10000;box-shadow:0 4px 15px rgba(0,0,0,0.7);width:220px;");
                dialog.id = "rs-colorpicker-save-dialog";
                
                const label = mkEl("div", "color:#999;font-size:11px;margin-bottom:4px;", { textContent: "Preset name:" });
                const input = mkEl("input", "width:100%;padding:5px;background:#111;color:#fff;border:1px solid #444;border-radius:3px;margin-bottom:5px;font-size:12px;box-sizing:border-box;");
                const btns = mkEl("div", "display:flex;gap:5px;");
                const okBtn = mkEl("button", "flex:1;padding:4px;background:#1a3a1a;color:#aaffaa;border:1px solid #4CAF50;border-radius:3px;cursor:pointer;font-size:11px;", { textContent: "OK" });
                const cancelBtn = mkEl("button", "flex:1;padding:4px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:3px;cursor:pointer;font-size:11px;", { textContent: "Cancel" });
                
                btns.append(okBtn, cancelBtn);
                dialog.append(label, input, btns);
                
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
                    
                    try {
                        const response = await api.fetchApi("/rs_colorpicker_save_preset", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                name,
                                color: node.data.color,
                                history: node.data.history
                            })
                        });
                        
                        if (response.ok) {
                            showRaykoToast(`Preset "${name}" saved`, "success", node);
                        } else {
                            showRaykoToast("Failed to save preset", "error", node);
                        }
                    } catch (err) {
                        showRaykoToast("Failed to save preset", "error", node);
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
            
            const showLoadPresetMenu = async (e) => {
                const existingMenu = document.getElementById("rs-colorpicker-load-menu");
                if (existingMenu) existingMenu.remove();
                
                const menu = mkEl("div", "position:fixed;background:#1a1a1a;border:2px solid #2196F3;border-radius:6px;max-height:300px;overflow-y:auto;z-index:10001;box-shadow:0 4px 20px rgba(33,150,243,0.3);min-width:250px;");
                menu.id = "rs-colorpicker-load-menu";
                menu.innerHTML = '<div style="padding:8px;color:#999;text-align:center;">Loading...</div>';
                
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
                    const response = await api.fetchApi("/rs_colorpicker_list_presets");
                    if (response.ok) {
                        const presets = await response.json();
                        menu.innerHTML = "";
                        
                        if (presets.length === 0) {
                            menu.textContent = "No presets found";
                            return;
                        }
                        
                        presets.forEach(name => {
                            const row = mkEl("div", "display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #333;");
                            
                            const nameSpan = mkEl("span", "flex:1;cursor:pointer;color:#ccc;font-size:12px;", { textContent: name });
                            nameSpan.onmouseenter = () => nameSpan.style.background = "#3a3a3a";
                            nameSpan.onmouseleave = () => nameSpan.style.background = "transparent";
                            nameSpan.onclick = async (ev) => {
                                ev.stopPropagation();
                                menu.remove();
                                document.removeEventListener("pointerdown", closeOutside, true);
                                
                                try {
                                    const loadResponse = await api.fetchApi("/rs_colorpicker_load_preset", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ name })
                                    });
                                    
                                    if (loadResponse.ok) {
                                        const data = await loadResponse.json();
                                        node.data = {
                                            color: data.color || "#ff0000",
                                            history: data.history || []
                                        };
                                        syncOutputs(node.data.color);
                                        showRaykoToast(`Preset "${name}" loaded`, "success", node);
                                    } else {
                                        showRaykoToast("Failed to load preset", "error", node);
                                    }
                                } catch (err) {
                                    showRaykoToast("Failed to load preset", "error", node);
                                }
                            };
                            
                            const deleteBtn = mkEl("span", "cursor:pointer;margin-left:8px;font-size:14px;opacity:0.7;", { textContent: "❌" });
                            deleteBtn.onmouseenter = () => { deleteBtn.style.opacity = "1"; deleteBtn.style.transform = "scale(1.2)"; };
                            deleteBtn.onmouseleave = () => { deleteBtn.style.opacity = "0.7"; deleteBtn.style.transform = "scale(1)"; };
                            deleteBtn.onclick = (ev) => {
                                ev.stopPropagation();
                                showDeleteConfirm(name, menu, closeOutside);
                            };
                            
                            row.append(nameSpan, deleteBtn);
                            menu.appendChild(row);
                        });
                    } else {
                        menu.textContent = "Error loading presets";
                    }
                } catch (err) {
                    menu.textContent = "Error loading presets";
                }
            };
            
            const showDeleteConfirm = (name, parentMenu, parentClose) => {
                const existingConfirm = document.getElementById("rs-colorpicker-delete-confirm");
                if (existingConfirm) existingConfirm.remove();
                
                const confirm = mkEl("div", "position:fixed;background:#2a2a2a;padding:10px;border:1px solid #f44336;border-radius:6px;z-index:10002;box-shadow:0 4px 15px rgba(0,0,0,0.7);width:220px;text-align:center;");
                confirm.id = "rs-colorpicker-delete-confirm";
                
                const text = mkEl("div", "color:#ccc;font-size:12px;margin-bottom:10px;word-break:break-word;", { textContent: `Delete preset "${name}"?` });
                const btns = mkEl("div", "display:flex;gap:5px;");
                const okBtn = mkEl("button", "flex:1;padding:4px;background:#3a1a1a;color:#ffaaaa;border:1px solid #f44336;border-radius:3px;cursor:pointer;font-size:11px;", { textContent: "OK" });
                const cancelBtn = mkEl("button", "flex:1;padding:4px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:3px;cursor:pointer;font-size:11px;", { textContent: "Cancel" });
                
                btns.append(okBtn, cancelBtn);
                confirm.append(text, btns);
                
                const rect = parentMenu.getBoundingClientRect();
                confirm.style.left = (rect.left + rect.width / 2 - 110) + "px";
                confirm.style.top = (rect.top + rect.height / 2 - 40) + "px";
                
                document.body.appendChild(confirm);
                
                const performDelete = async () => {
                    confirm.remove();
                    document.removeEventListener("pointerdown", closeConfirm, true);
                    
                    try {
                        const response = await api.fetchApi("/rs_colorpicker_delete_preset", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name })
                        });
                        
                        if (response.ok) {
                            showRaykoToast(`Preset "${name}" deleted`, "success", node);
                            if (parentMenu) {
                                parentMenu.remove();
                            }
                            if (typeof parentClose === 'function') {
                                try {
                                    parentClose({ target: confirm });
                                } catch (e) {}
                            }
                        } else {
                            showRaykoToast("Failed to delete preset", "error", node);
                        }
                    } catch (err) {
                        console.error("[RS ColorPicker] Delete error:", err);
                        showRaykoToast("Failed to delete preset", "error", node);
                    }
                };
                
                okBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    performDelete();
                };
                cancelBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    confirm.remove();
                    document.removeEventListener("pointerdown", closeConfirm, true);
                };
                
                const clickTime = Date.now();
                const closeConfirm = (ev) => {
                    if (Date.now() - clickTime < 300) return;
                    if (!confirm.contains(ev.target)) {
                        confirm.remove();
                        document.removeEventListener("pointerdown", closeConfirm, true);
                    }
                };
                
                setTimeout(() => {
                    document.addEventListener("pointerdown", closeConfirm, true);
                }, 50);
            };
            
            savePresetBtn.onclick = (e) => {
                e.stopPropagation();
                showSavePresetDialog(e);
            };
            
            loadPresetBtn.onclick = (e) => {
                e.stopPropagation();
                showLoadPresetMenu(e);
            };
            
            let isColorPickerOpen = false;
            
            colorInput.addEventListener("input", (e) => {
                const color = normalizeHex(e.target.value);
                swatch.style.background = color;
                hexInput.value = color.toUpperCase();
                isColorPickerOpen = true;
            });
            
            colorInput.addEventListener("change", (e) => {
                syncOutputs(e.target.value);
                isColorPickerOpen = false;
            });
            
            document.addEventListener("mouseup", () => {
                if (isColorPickerOpen) {
                    syncOutputs(colorInput.value);
                    isColorPickerOpen = false;
                }
            });
            
            hexInput.addEventListener("change", (e) => {
                let val = e.target.value.trim();
                if (!val.startsWith("#")) val = "#" + val;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    syncOutputs(val);
                }
            });
            
            node.addDOMWidget("rs_colorpicker", "custom", root, { serialize: false });
            
            const onConfigure = node.onConfigure;
            node.onConfigure = function(o) {
                if (onConfigure) onConfigure.apply(this, arguments);
                if (hiddenWidget && hiddenWidget.value) {
                    try {
                        const restoredData = JSON.parse(hiddenWidget.value);
                        if (restoredData) {
                            node.data = { ...node.data, ...restoredData };
                            if (node.data.color) {
                                syncOutputs(node.data.color);
                            }
                        }
                    } catch (e) {}
                }
            };
            
            syncOutputs(node.data.color || "#ff0000");
            
            return result;
        };
    },
});