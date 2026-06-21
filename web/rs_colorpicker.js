import { app } from "../../scripts/app.js";

const NODE_CLASS = "RSColorPicker";
const NODE_W = 200;
const NODE_H = 260;
const NODE_CHROME_H = 32;
const PRESETS = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#ffffff", "#000000"];
const HISTORY_KEY = "rs_colorpicker_history";

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

function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } 
    catch { return []; }
}

function addToHistory(color) {
    const history = getHistory().filter(c => c !== color);
    history.unshift(color);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 24)));
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
        
        if (!el) {
            this.magnifier.style.display = 'block';
            return null;
        }
        
        if (this.magnifier.contains(el)) {
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
        
        if (color) {
            const hex = rgbToHex(color.r, color.g, color.b);
            if (this.onPick) this.onPick(hex);
        }
    }
    
    _onKeyDown(e) {
        if (e.key === 'Escape') {
            this.stop();
        }
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
            
            const colorWidget = node.widgets?.find(w => w.name === "color");
            let initialColor = "#ff0000";
            if (colorWidget) {
                initialColor = colorWidget.value || "#ff0000";
                colorWidget.hidden = true;
                colorWidget.computeSize = () => [0, 0];
            }
            initialColor = normalizeHex(initialColor);
            
            const root = mkEl("div", "display:flex;flex-direction:column;gap:4px;padding:3px;overflow:hidden;");
            
            const basicLabel = mkEl("div", "color:#999;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;padding-left:2px;", { 
                textContent: "Basic Colors" 
            });
            
            const presetsRow = mkEl("div", "display:flex;gap:3px;flex-wrap:wrap;");
            PRESETS.forEach(color => {
                const btn = mkEl("div", `width:19px;height:19px;border-radius:3px;background:${color};cursor:pointer;border:1px solid #333;transition:transform 0.1s;`);
                btn.onmouseenter = () => btn.style.transform = "scale(1.2)";
                btn.onmouseleave = () => btn.style.transform = "scale(1)";
                btn.onclick = () => {
                    swatch.style.background = color;
                    colorInput.value = color;
                    hexInput.value = color.toUpperCase();
                    syncOutputs(color);
                };
                presetsRow.append(btn);
            });
            
            const topRow = mkEl("div", "display:flex;gap:17px;align-items:center;margin-top:5px;");
            
            const swatch = mkEl("div", `width:36px;height:36px;border-radius:4px;border:2px solid #444;background:${initialColor};cursor:pointer;flex-shrink:0;transition:border-color 0.1s;`);
            swatch.onmouseenter = () => swatch.style.borderColor = "#6688aa";
            swatch.onmouseleave = () => swatch.style.borderColor = "#444";
            
            const colorInput = mkEl("input", "width:0;height:0;opacity:0;position:absolute;", { type: "color", value: initialColor });
            
            const hexInput = mkEl("input", "width:10ch;padding:4px 6px;background:#1e1e1e;color:#ccc;border:1px solid #444;border-radius:4px;font-family:monospace;font-size:12px;flex-shrink:0;box-sizing:border-box;", { value: initialColor.toUpperCase() });
            
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
                        const color = normalizeHex(result.sRGBHex);
                        swatch.style.background = color;
                        colorInput.value = color;
                        hexInput.value = color.toUpperCase();
                        syncOutputs(color);
                        return;
                    } catch (e) { return; }
                }
                
                const rect = eyedropperBtn.getBoundingClientRect();
                canvasEyedropper.start((hex) => {
                    const color = normalizeHex(hex);
                    swatch.style.background = color;
                    colorInput.value = color;
                    hexInput.value = color.toUpperCase();
                    syncOutputs(color);
                }, rect);
            };
            
            swatch.onclick = () => colorInput.click();
            swatch.ondblclick = () => {
                navigator.clipboard.writeText(hexInput.value.toUpperCase());
                swatch.style.borderColor = "#50cc50";
                setTimeout(() => swatch.style.borderColor = "#444", 300);
            };
            
            topRow.append(swatch, colorInput, hexInput, eyedropperBtn);
            
            const recentLabel = mkEl("div", "color:#999;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;padding-left:2px;margin-top:5px;", { 
                textContent: "Recent Colors" 
            });
            
            const historyRow = mkEl("div", "display:flex;gap:3px;flex-wrap:wrap;");
            const updateHistory = () => {
                historyRow.innerHTML = '';
                getHistory().forEach(color => {
                    const btn = mkEl("div", `width:19px;height:19px;border-radius:3px;background:${color};cursor:pointer;border:1px solid #333;transition:transform 0.1s;`);
                    btn.onmouseenter = () => btn.style.transform = "scale(1.2)";
                    btn.onmouseleave = () => btn.style.transform = "scale(1)";
                    btn.onclick = () => {
                        swatch.style.background = color;
                        colorInput.value = color;
                        hexInput.value = color.toUpperCase();
                        syncOutputs(color);
                    };
                    historyRow.append(btn);
                });
            };
            updateHistory();
            
            root.append(basicLabel, presetsRow, topRow, recentLabel, historyRow);
            
            const syncOutputs = (color) => {
                const normalized = normalizeHex(color);
                if (colorWidget) {
                    colorWidget.value = normalized;
                }
                
                const rgb = hexToRGB(normalized);
                if (node.outputs) {
                    node.outputs[0].value = hexToInt(normalized);
                    node.outputs[1].value = normalized.toUpperCase();
                    node.outputs[2].value = `${rgb.r.toFixed(3)}, ${rgb.g.toFixed(3)}, ${rgb.b.toFixed(3)}`;
                }
                
                addToHistory(normalized);
                updateHistory();
                
                if (node.graph) node.graph.setDirtyCanvas(true, true);
            };
            
            colorInput.addEventListener("input", (e) => {
                const color = normalizeHex(e.target.value);
                swatch.style.background = color;
                hexInput.value = color.toUpperCase();
                syncOutputs(color);
            });
            
            hexInput.addEventListener("change", (e) => {
                let val = e.target.value.trim();
                if (!val.startsWith("#")) val = "#" + val;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    const normalized = normalizeHex(val);
                    swatch.style.background = normalized;
                    colorInput.value = normalized;
                    hexInput.value = normalized.toUpperCase();
                    syncOutputs(normalized);
                }
            });
            
            const domWidget = node.addDOMWidget("rs_colorpicker", "custom", root, { serialize: false });
            
            syncOutputs(initialColor);
            
            return result;
        };
    },
});