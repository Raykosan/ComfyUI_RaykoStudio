console.log("[SPLINE 🦊] rs_colorpicker.js LOADED!");
import { app } from "../../scripts/app.js";

const NODE_CLASS = "RSColorPicker";
const WIDGET_W = 150;
const WIDGET_H = 32;
const NODE_CHROME_H = 32; // ComfyUI title bar + padding overhead

function mkEl(tag, css, extra) {
    const el = document.createElement(tag);
    if (css) el.style.cssText = css;
    if (extra) Object.assign(el, extra);
    return el;
}

function buildUI(defaultColor) {
    const root = mkEl("div", "width:100%;height:100%;display:flex;align-items:center;gap:6px;padding:3px 6px;box-sizing:border-box;font-family:system-ui,sans-serif;");
    
    const swatch = mkEl("div", `width:26px;height:26px;border-radius:4px;border:1.5px solid #444;cursor:pointer;background:${defaultColor};flex-shrink:0;transition:border-color 0.1s;`);
    swatch.onmouseenter = () => { swatch.style.borderColor = "#6688aa"; };
    swatch.onmouseleave = () => { swatch.style.borderColor = "#444"; };
    
    const colorPicker = mkEl("input", "width:0;height:0;opacity:0;position:absolute;pointer-events:none;", { type: "color", value: defaultColor });
    
    const hexInput = mkEl("input", "width:74px;padding:4px 5px;font-size:12px;font-family:monospace;background:#1e1e1e;color:#ccc;border:1px solid #444;border-radius:4px;text-align:center;outline:none;", { value: defaultColor.toUpperCase() });
    hexInput.addEventListener("focus", () => { hexInput.style.borderColor = "#5090cc"; });
    hexInput.addEventListener("blur", () => { hexInput.style.borderColor = "#444"; });
    
    swatch.onclick = () => colorPicker.click();
    
    root.append(swatch, colorPicker, hexInput);
    return { root, swatch, colorPicker, hexInput };
}

app.registerExtension({
    name: "RSColorPicker",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = origOnNodeCreated?.apply(this, arguments);
            const node = this;
            const colorWidget = node.widgets?.find(w => w.name === "color");
            
            if (colorWidget) {
                colorWidget.hidden = true;
                colorWidget.computeSize = () => [0, -4];
            }
            
            const initialColor = colorWidget?.value || "#ff0000";
            const dom = buildUI(initialColor);
            
            const syncToWidget = (color) => {
                if (colorWidget) colorWidget.value = color;
                if (node.graph) node.graph.setDirtyCanvas(true, true);
            };
            
            dom.colorPicker.addEventListener("input", (e) => {
                const color = e.target.value;
                dom.swatch.style.background = color;
                dom.hexInput.value = color.toUpperCase();
                syncToWidget(color);
            });
            
            dom.hexInput.addEventListener("change", (e) => {
                let val = e.target.value.trim();
                if (!val.startsWith("#")) val = "#" + val;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    dom.swatch.style.background = val;
                    dom.colorPicker.value = val;
                    dom.hexInput.value = val.toUpperCase();
                    syncToWidget(val);
                } else {
                    dom.hexInput.value = dom.colorPicker.value.toUpperCase();
                }
            });
            
            const domWidget = node.addDOMWidget("rs_colorpicker", "custom", dom.root, {
                serialize: false,
                hideOnZoom: false,
            });
            
            domWidget.computeSize = () => [WIDGET_W, WIDGET_H];
            node.setSize([WIDGET_W + 20, WIDGET_H + NODE_CHROME_H]);
            
            if (node.widgets && colorWidget) {
                const idx = node.widgets.indexOf(colorWidget);
                if (idx >= 0) {
                    node.widgets.splice(idx, 1);
                    node.widgets.push(colorWidget);
                }
            }
            
            return result;
        };
    },
});