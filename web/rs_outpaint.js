import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_CLASS  = "RSOutpaint";
const CANVAS_H    = 320;
const MARGIN      = 22;
const GRID        = 16;
const OVERHANG    = 1;
const CTRL_H      = 240;
const MIN_DRAG_PX = GRID;

let queueWasRunning = false;
let batchResetTimer = null;
let allNodes = []; 

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function crToSrc(cr, sf, scale) { return { x: (cr.x - sf.x) / scale, y: (cr.y - sf.y) / scale, w: cr.w / scale, h: cr.h / scale }; }
function srcToCr(s, sf, scale) { return { x: sf.x + s.x * scale, y: sf.y + s.y * scale, w: s.w * scale, h: s.h * scale }; }
function quantizeSrc(s) { return { x: Math.round(s.x / GRID) * GRID, y: Math.round(s.y / GRID) * GRID, w: Math.max(GRID, Math.round(s.w / GRID) * GRID), h: Math.max(GRID, Math.round(s.h / GRID) * GRID) }; }
function clampToValid(s, srcW, srcH) { const c = { ...s }; if (c.x >= srcW - OVERHANG) c.x = srcW - OVERHANG; if (c.y >= srcH - OVERHANG) c.y = srcH - OVERHANG; if (c.x + c.w <= OVERHANG) c.x = OVERHANG - c.w; if (c.y + c.h <= OVERHANG) c.y = OVERHANG - c.h; return c; }
function applyCanvasCr(canvasCr, st) { let s = crToSrc(canvasCr, st.sf, st.scale); s = quantizeSrc(s); s = clampToValid(s, st.srcW, st.srcH); st.cr = srcToCr(s, st.sf, st.scale); }
function toWorld(e, wrapEl, view) { const rect = wrapEl.getBoundingClientRect(); return { x: (e.clientX - rect.left - view.panX) / view.zoom, y: (e.clientY - rect.top - view.panY) / view.zoom }; }
function defaultOut(_st) { return { w: 0, h: 0 }; }

// ТВОЙ ПЛАН: Добавлены approved и srcHash
function createState() {
    return { 
        srcW: 1280, srcH: 720, scale: 1, sf: { x: 0, y: 0, w: 0, h: 0 }, 
        cr: { x: 0, y: 0, w: 0, h: 0 }, cropAR: 16 / 9, arLocked: false, 
        initialized: false, view: { zoom: 1.0, panX: 0, panY: 0 }, 
        outW: 0, outH: 0, maskColor: "#ff0000", bgColor: "#141414", 
        batchMode: false, hasPreset: false,
        approved: false,
        srcHash: null
    };
}

function setUIActive(dom, isActive) {
    const opacity = isActive ? "1" : "0.4";
    const pointerEvents = isActive ? "auto" : "none";
    const filter = isActive ? "none" : "grayscale(100%)";
    
    dom.savePresetBtn.style.opacity = opacity;
    dom.savePresetBtn.style.pointerEvents = pointerEvents;
    dom.savePresetBtn.style.filter = filter;
    
    dom.applyPresetBtn.style.opacity = opacity;
    dom.applyPresetBtn.style.pointerEvents = pointerEvents;
    dom.applyPresetBtn.style.filter = filter;
    
    for (const btn of dom.chipBtns) {
        btn.style.opacity = opacity;
        btn.style.pointerEvents = pointerEvents;
        btn.style.filter = filter;
    }
    
    for (const btn of dom.snapBtns) {
        btn.style.opacity = opacity;
        btn.style.pointerEvents = pointerEvents;
        btn.style.filter = filter;
    }
    
    dom.arBtn.style.opacity = opacity;
    dom.arBtn.style.pointerEvents = pointerEvents;
    dom.arBtn.style.filter = filter;
    
    // ResetBtn намеренно НЕ трогаем — он всегда активен
    
    dom.wInput.style.opacity = opacity;
    dom.wInput.style.pointerEvents = pointerEvents;
    
    dom.hInput.style.opacity = opacity;
    dom.hInput.style.pointerEvents = pointerEvents;
    
    dom.maskColorInput.picker.style.opacity = opacity;
    dom.maskColorInput.picker.style.pointerEvents = pointerEvents;
    dom.maskColorInput.hexInput.style.opacity = opacity;
    dom.maskColorInput.hexInput.style.pointerEvents = pointerEvents;
    dom.maskColorInput.swatch.style.opacity = opacity;
    dom.maskColorInput.swatch.style.pointerEvents = pointerEvents;
    
    dom.bgColorInput.picker.style.opacity = opacity;
    dom.bgColorInput.picker.style.pointerEvents = pointerEvents;
    dom.bgColorInput.hexInput.style.opacity = opacity;
    dom.bgColorInput.hexInput.style.pointerEvents = pointerEvents;
    dom.bgColorInput.swatch.style.opacity = opacity;
    dom.bgColorInput.swatch.style.pointerEvents = pointerEvents;
    
    dom.batchBtn.style.opacity = opacity;
    dom.batchBtn.style.pointerEvents = pointerEvents;
    dom.batchBtn.style.filter = filter;
}

// ТВОЙ ПЛАН: Сброс approved, srcHash и скрытие кнопок
function resetNodeState(st, dom, widgets, nodeId) { // <-- Добавлен nodeId
    const savedMaskColor = st.maskColor;
    const savedBgColor = st.bgColor;

    // Сбрасываем утверждение на сервере перед локальным сбросом
    if (st.srcHash && nodeId) {
        fetch("/rs_outpaint/unapprove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: String(nodeId), src_hash: st.srcHash })
        }).catch(() => {});
    }

    Object.assign(st, createState());
    st.maskColor = savedMaskColor;
    st.bgColor = savedBgColor;
    st.approved = false;
    st.srcHash = null;

    st.arLocked = false;
    dom.arBtn.textContent = "🔓"; dom.arBtn.style.border = "1px solid #444"; dom.arBtn.style.background = "#2a2a2a"; dom.arBtn.style.color = "#bbb"; dom.arBtn._active = false;
    
    dom.waitingMsg.style.display = "none";
    dom.acceptBtn.style.display = "none";
    dom.cancelBtn.style.display = "none";
    dom.batchBtn.style.display = "none";
    
    if(dom.wInput) dom.wInput.value = ""; if(dom.hInput) dom.hInput.value = "";
    if(dom.maskColorInput) { dom.maskColorInput.picker.value = st.maskColor; dom.maskColorInput.swatch.style.background = st.maskColor; dom.maskColorInput.hexInput.value = st.maskColor.toUpperCase(); }
    if(dom.bgColorInput) { dom.bgColorInput.picker.value = st.bgColor; dom.bgColorInput.swatch.style.background = st.bgColor; dom.bgColorInput.hexInput.value = st.bgColor.toUpperCase(); }
    if(dom.presetNameInput) dom.presetNameInput.style.display = "none";
    if(dom.presetListOverlay) dom.presetListOverlay.style.display = "none";
    if(dom.noDataMsg) { dom.noDataMsg.style.display = "none"; dom.noDataMsg.textContent = ""; }
    if(dom.imageEl) { dom.imageEl.style.display = "none"; if (dom.imageEl.src && dom.imageEl.src.startsWith("blob:")) URL.revokeObjectURL(dom.imageEl.src); }
    
    updateMaskColors(st, dom);
    st.initialized = false;
    syncWidgets(st, widgets, { graph: null });
    setUIActive(dom, false);
}

// ТВОЙ ПЛАН: Функция для сброса флага approved при любом изменении кропа
function unapprove(st, dom, nodeId) {
    if (st.approved) {
        st.approved = false;
        dom.waitingMsg.style.display = "flex";
        dom.acceptBtn.style.display = "block";
        dom.cancelBtn.style.display = "block";
        dom.batchBtn.style.display = "block";
        dom.acceptBtn.disabled = false;
        dom.acceptBtn.textContent = "✔️ ACCEPT";
        setUIActive(dom, true);
        
        if (st.srcHash && nodeId) {
            fetch("/rs_outpaint/unapprove", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node_id: String(nodeId),
                    src_hash: st.srcHash
                })
            }).catch(err => console.error("Unapprove failed:", err));
        }
    }
}

function initLayout(st, wrapEl) {
    const W = wrapEl.clientWidth;
    if (W <= 0) return false;
    const maxW = W - MARGIN * 2;
    const maxH = wrapEl.clientHeight - MARGIN * 2;
    const ar   = st.srcW / st.srcH;
    let sfW, sfH;
    if (maxW / ar <= maxH) { sfW = maxW; sfH = Math.round(maxW / ar); } else { sfH = maxH; sfW = Math.round(maxH * ar); }
    const sfX = Math.round((W - sfW) / 2);
    const sfY = Math.max(MARGIN, Math.round((wrapEl.clientHeight - sfH) / 2));
    st.sf = { x: sfX, y: sfY, w: sfW, h: sfH };
    st.scale = sfW / st.srcW;
    st.view = { zoom: 1.0, panX: 0, panY: 0 };
    
    const defW = st.srcW;
    const defH = st.srcH;
    const defX = 0;
    const defY = 0;
    
    const def = clampToValid({ x: defX, y: defY, w: defW, h: defH }, st.srcW, st.srcH);
    st.cr = srcToCr(def, st.sf, st.scale);
    st.cropAR = defW / defH;
    
    st.outW = 0;
    st.outH = 0;
    st.arLocked = false; 
    
    st.initialized = true;
    return true;
}

function mkEl(tag, css, extra) { const el = document.createElement(tag); if (css) el.style.cssText = css; if (extra) Object.assign(el, extra); return el; }
function mkBtn(label, css) { const b = mkEl("button", `padding:2px 7px;font-size:10px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#bbb;cursor:pointer;${css||""}`); b.textContent = label; b.onmouseenter = () => { b.style.background = "#3a3a3a"; }; b.onmouseleave = () => { b.style.background = b._active ? "#1a3a5a" : "#2a2a2a"; }; return b; }
function mkColorInput(label, defaultColor) {
    const row = mkEl("div", "display:flex;align-items:center;gap:6px;font-size:11px;color:#999;");
    const lbl = mkEl("span", ""); lbl.textContent = label;
    const colorPicker = mkEl("input", "width:0;height:0;opacity:0;position:absolute;pointer-events:none;appearance:none;-webkit-appearance:none;padding:0;border:0;", { type: "color", value: defaultColor });
    const swatch = mkEl("div", `width:22px;height:22px;border-radius:4px;border:1px solid #444;cursor:pointer;background:${defaultColor};`);
    const hexInput = mkEl("input", "width:76px;padding:2px 4px;font-size:10px;font-family:monospace;background:#1e1e1e;color:#ccc;border:1px solid #444;border-radius:4px;text-align:center;", { value: defaultColor.toUpperCase() });
    swatch.onclick = () => colorPicker.click();
    row.append(lbl, swatch, colorPicker, hexInput);
    return { row, picker: colorPicker, hexInput, swatch };
}

function buildUI() {
    const root = mkEl("div", "width:100%;box-sizing:border-box;padding:6px 8px 10px;font-family:system-ui,sans-serif;font-size:12px;color:#ccc;position:relative;");
    const wrap = mkEl("div", `position:relative;min-height:${CANVAS_H}px;background:#181818;border:1px solid #3a3a3a;border-radius:6px;overflow:hidden;user-select:none;touch-action:none;cursor:default;`);
    const sfEl = mkEl("div", "position:absolute;background:#222;overflow:hidden;border:1px solid #333;");
    const imageEl = mkEl("img", "position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:none;"); imageEl.alt = "";
    const srcLabel = mkEl("div", "position:absolute;bottom:5px;right:7px;font-size:9px;color:rgba(255,255,255,0.3);font-family:monospace;pointer-events:none;"); srcLabel.textContent = "source";
    const noDataMsg = mkEl("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:rgba(255,255,255,0.2);pointer-events:none;text-align:center;padding:8px;"); noDataMsg.textContent = "1280×720 (default placeholder)";
    const waitingMsg = mkEl("div", "position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:12px;color:rgba(255,200,100,0.8);pointer-events:none;text-align:center;padding:8px;font-weight:600;"); waitingMsg.textContent = "⏳ Adjust mask & click ACCEPT...";
    sfEl.append(imageEl, srcLabel, noDataMsg, waitingMsg);
    const mkMask = () => mkEl("div", "position:absolute;background:rgba(210,70,70,0.28);pointer-events:none;display:none;");
    const [maskTop, maskBot, maskLeft, maskRight] = [mkMask(), mkMask(), mkMask(), mkMask()];
    const cropBox = mkEl("div", "position:absolute;cursor:move;border:2px solid rgba(80,150,255,0.9);background:rgba(50,120,200,0.08);will-change:left,top,width,height;display:none;");
    const HBASE = "position:absolute;width:11px;height:11px;background:#ddd;border:1.5px solid rgba(60,120,200,0.85);border-radius:2px;";
    const corners = { tl: mkEl("div", HBASE+"top:0;left:0;transform:translate(-50%,-50%);cursor:nw-resize;"), tr: mkEl("div", HBASE+"top:0;right:0;transform:translate(50%,-50%);cursor:ne-resize;"), bl: mkEl("div", HBASE+"bottom:0;left:0;transform:translate(-50%,50%);cursor:sw-resize;"), br: mkEl("div", HBASE+"bottom:0;right:0;transform:translate(50%,50%);cursor:se-resize;") };
    for (const [dir, el] of Object.entries(corners)) { el.dataset.dir = dir; cropBox.appendChild(el); }
    const sizeLabel = mkEl("div", "position:absolute;font-family:monospace;font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);background:rgba(0,0,0,0.45);padding:1px 6px;border-radius:3px;pointer-events:none;white-space:nowrap;transform:translateX(-50%);");
    const PAD_CSS = "position:absolute;font-family:monospace;font-size:10px;color:rgba(255,200,200,0.80);pointer-events:none;white-space:nowrap;";
    const padLabelT = mkEl("div", PAD_CSS), padLabelB = mkEl("div", PAD_CSS), padLabelL = mkEl("div", PAD_CSS), padLabelR = mkEl("div", PAD_CSS);
    const EBASE = "position:absolute;background:#ddd;border:1.5px solid rgba(60,120,200,0.85);border-radius:2px;pointer-events:auto;";
    const edges = { t: mkEl("div", EBASE+"width:18px;height:7px;top:0;left:50%;transform:translate(-50%,-50%);cursor:n-resize;"), b: mkEl("div", EBASE+"width:18px;height:7px;bottom:0;left:50%;transform:translate(-50%,50%);cursor:s-resize;"), l: mkEl("div", EBASE+"width:7px;height:18px;left:0;top:50%;transform:translate(-50%,-50%);cursor:w-resize;"), r: mkEl("div", EBASE+"width:7px;height:18px;right:0;top:50%;transform:translate(50%,-50%);cursor:e-resize;") };
    for (const [dir, el] of Object.entries(edges)) { el.dataset.dir = dir; cropBox.appendChild(el); }
    const viewport = mkEl("div", "position:absolute;inset:0;transform-origin:0 0;");
    viewport.append(sfEl, maskTop, maskBot, maskLeft, maskRight, cropBox, sizeLabel, padLabelT, padLabelB, padLabelL, padLabelR);
    wrap.appendChild(viewport);
    const zoomIndicator = mkEl("button", "position:absolute;bottom:6px;left:7px;padding:2px 6px;font-size:10px;font-family:monospace;background:rgba(0,0,0,0.55);color:#888;border:1px solid #444;border-radius:3px;cursor:pointer;z-index:10;");
    zoomIndicator.title = "Click to reset zoom (scroll to zoom, middle-drag to pan)"; zoomIndicator.textContent = "100%"; wrap.appendChild(zoomIndicator);
    const ctrl = mkEl("div", "display:flex;flex-direction:column;gap:4px;margin-top:7px;");
    const presetBtnRow = mkEl("div", "display:flex;align-items:center;gap:6px;justify-content:center;width:100%;margin-bottom:2px;position:relative;");
    const savePresetBtn = mkEl("button", "padding:3px 9px;font-size:11px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;flex:1;");
    savePresetBtn.textContent = "💾 Save preset";
    savePresetBtn.title = "Save current crop as preset";
    const applyPresetBtn = mkEl("button", "padding:3px 9px;font-size:11px;border:1px solid #99c0ee;border-radius:5px;background:#1a3a5a;color:#aadaff;cursor:pointer;flex:1;");
    applyPresetBtn.textContent = "📂 Select preset";
    applyPresetBtn.title = "Load saved preset";
    presetBtnRow.append(savePresetBtn, applyPresetBtn);
    ctrl.appendChild(presetBtnRow);
    const presetListOverlay = mkEl("div", "position:absolute;display:none;top:50%;left:50%;transform:translate(-50%, -50%);flex-direction:column;max-height:200px;overflow-y:auto;background:#2a2a2a;border:1px solid #5090cc;border-radius:6px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.8);min-width:180px;padding:5px;");
    root.appendChild(presetListOverlay);
    const presetNameInput = mkEl("div", "position:absolute;display:none;top:50%;left:50%;transform:translate(-50%, -50%);background:#2a2a2a;padding:10px;border:1px solid #5090cc;border-radius:6px;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.7);width:220px;text-align:center;");
    const inputField = mkEl("input", "width:100%;padding:5px;background:#111;color:#fff;border:1px solid #444;border-radius:3px;margin-bottom:5px;font-size:12px;", { placeholder: "Preset name..." });
    const inputBtns = mkEl("div", "display:flex;gap:5px;");
    const inputOk = mkEl("button", "flex:1;padding:4px;background:#1a3a5a;color:#aadaff;border:1px solid #5090cc;border-radius:3px;cursor:pointer;font-size:11px;"); inputOk.textContent = "OK";
    const inputCancel = mkEl("button", "flex:1;padding:4px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:3px;cursor:pointer;font-size:11px;"); inputCancel.textContent = "Cancel";
    inputBtns.append(inputOk, inputCancel);
    presetNameInput.append(inputField, inputBtns);
    root.appendChild(presetNameInput);
    const cropSizeRow = mkEl("div", "display:flex;align-items:center;gap:5px;flex-wrap:wrap;");
    const INPUT_CSS = "width:58px;padding:2px 5px;font-size:11px;font-family:monospace;background:#1e1e1e;color:#ccc;border:1px solid #444;border-radius:4px;text-align:right;";
    const wLabel = mkEl("span", "font-size:10px;color:#999;"); wLabel.textContent = "W";
    const wInput = mkEl("input", INPUT_CSS, { type: "number", min: GRID, step: GRID, value: "" });
    const hLabel = mkEl("span", "font-size:10px;color:#999;"); hLabel.textContent = "H";
    const hInput = mkEl("input", INPUT_CSS, { type: "number", min: GRID, step: GRID, value: "" });
    const arBtn = mkEl("button", "padding:3px 9px;font-size:11px;border:1px solid #444;border-radius:5px;background:#2a2a2a;color:#bbb;cursor:pointer;"); arBtn.textContent = "🔓"; arBtn._active = false;
    const resetBtn = mkEl("button", "padding:3px 9px;font-size:11px;border:1px solid #444;border-radius:5px;background:#2a2a2a;color:#bbb;cursor:pointer;"); 
    resetBtn.textContent = "🔄️ Reset";
    resetBtn.onmouseenter = () => { resetBtn.style.background = "#3a3a3a"; };
    resetBtn.onmouseleave = () => { resetBtn.style.background = "#2a2a2a"; };
    
    cropSizeRow.append(wLabel, wInput, hLabel, hInput, arBtn, resetBtn);
    const CHIP_PRESETS = [["16:9",1280,720],["9:16",720,1280],["21:9",1344,576],["9:21",576,1344],["4:3",960,720],["3:4",720,960],["1:1",960,960],["3:2",1080,720],["2:3",720,1080]];
    const CHIP_CSS = "padding:2px 7px;font-size:10px;font-family:monospace;border:1px solid #444;border-radius:12px;background:#222;color:#999;cursor:pointer;white-space:nowrap;flex-shrink:0;";
    const presetRow = mkEl("div", "display:flex;gap:4px;overflow-x:auto;padding-bottom:2px;flex-wrap:nowrap;");
    const chipBtns = CHIP_PRESETS.map(([label, w, h]) => { const btn = mkEl("button", CHIP_CSS); btn.textContent = label; btn.dataset.chipW = w; btn.dataset.chipH = h; btn.dataset.chipAR = w/h; presetRow.appendChild(btn); return btn; });
    const snapRow = mkEl("div", "display:flex;align-items:center;gap:0;");
    const snapLabel = mkEl("span", "font-size:10px;color:#999;margin-right:4px;"); snapLabel.textContent = "snap:";
    const SNAP_DEFS = [["center","center"],["top","top"],["bottom","bottom"],["left","left"],["right","right"],["fitW","fit W"],["fitH","fit H"]];
    const snapBtns = SNAP_DEFS.map(([key, label], i) => { const isFirst = i===0, isLast = i===SNAP_DEFS.length-1; const radius = isFirst ? "4px 0 0 4px" : (isLast ? "0 4px 4px 0" : "0"); const bl = isFirst ? "1px solid #444" : "none"; const b = mkEl("button", `padding:2px 7px;font-size:10px;border:1px solid #444;border-left:${bl};border-radius:${radius};background:#2a2a2a;color:#bbb;cursor:pointer;white-space:nowrap;`); b.textContent = label; b.dataset.snap = key; return b; });
    snapRow.append(snapLabel, ...snapBtns);
    
    ctrl.append(cropSizeRow, presetRow, snapRow);
    
    const maskColorInput = mkColorInput("mask:", "#ff0000");
    const bgColorInput = mkColorInput("bg:", "#141414");
    const colorRow = mkEl("div", "display:flex;align-items:center;gap:8px;flex-wrap:wrap;");
    colorRow.append(maskColorInput.row, bgColorInput.row);
    ctrl.appendChild(colorRow);
    const batchBtn = mkEl("button", "padding:4px 12px;font-size:11px;font-weight:600;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#bbb;cursor:pointer;width:100%;text-align:center;display:none;margin-top:4px;");
    batchBtn.textContent = "⚙️ BATCH"; batchBtn.dataset.active = "false"; batchBtn.title = "Enable to reuse crop settings on new images";
    ctrl.appendChild(batchBtn);
    const acceptBtn = mkEl("button", "padding:4px 12px;font-size:11px;font-weight:600;border:1px solid #28a745;border-radius:4px;background:#1a2a1a;color:#aaffaa;cursor:pointer;width:100%;text-align:center;display:none;margin-top:4px;");
    acceptBtn.textContent = "✔️ ACCEPT"; ctrl.appendChild(acceptBtn);
    const cancelBtn = mkEl("button", "padding:4px 12px;font-size:11px;font-weight:600;border:1px solid #884444;border-radius:4px;background:#2a1a1a;color:#ffaaaa;cursor:pointer;width:100%;text-align:center;display:none;margin-top:2px;");
    cancelBtn.textContent = "❌ CANCEL"; ctrl.appendChild(cancelBtn);
    root.append(wrap, ctrl);
    return { root, wrap, viewport, zoomIndicator, sfEl, imageEl, srcLabel, noDataMsg, waitingMsg, maskTop, maskBot, maskLeft, maskRight, cropBox, arBtn, snapBtns, wInput, hInput, resetBtn, chipBtns, sizeLabel, padLabelT, padLabelB, padLabelL, padLabelR, edges, acceptBtn, cancelBtn, batchBtn, presetListOverlay, savePresetBtn, applyPresetBtn, presetNameInput, inputField, inputOk, inputCancel, maskColorInput, bgColorInput };
}

function updateMaskColors(st, dom) { if (!dom) return; const maskColor = st.maskColor, alpha = "45"; const applyColor = (el) => { if(el) el.style.backgroundColor = maskColor + alpha; }; applyColor(dom.maskTop); applyColor(dom.maskBot); applyColor(dom.maskLeft); applyColor(dom.maskRight); dom.padLabelT.style.color = maskColor; dom.padLabelB.style.color = maskColor; dom.padLabelL.style.color = maskColor; dom.padLabelR.style.color = maskColor; }

function render(st, dom) {
    if (!st.initialized) return;
    const { sf, cr, srcW, srcH, view } = st;
    dom.viewport.style.transform = `translate(${view.panX}px,${view.panY}px) scale(${view.zoom})`;
    dom.zoomIndicator.textContent = Math.round(view.zoom * 100) + "%";
    dom.sfEl.style.left = sf.x + "px"; dom.sfEl.style.top = sf.y + "px"; dom.sfEl.style.width = sf.w + "px"; dom.sfEl.style.height = sf.h + "px";
    dom.srcLabel.textContent = `${srcW} × ${srcH}`;
    dom.cropBox.style.display = "block";
    dom.cropBox.style.left = cr.x + "px"; dom.cropBox.style.top = cr.y + "px"; dom.cropBox.style.width = cr.w + "px"; dom.cropBox.style.height = cr.h + "px";
    const s = crToSrc(cr, sf, st.scale);
    const ix1 = Math.max(cr.x, sf.x), iy1 = Math.max(cr.y, sf.y), ix2 = Math.min(cr.x + cr.w, sf.x + sf.w), iy2 = Math.min(cr.y + cr.h, sf.y + sf.h);
    const setMask = (el, x, y, w, h) => { if (w > 0 && h > 0) { el.style.cssText = `position:absolute;background:rgba(210,70,70,0.28);pointer-events:none;display:block;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`; } else { el.style.display = "none"; } };
    setMask(dom.maskTop, cr.x, cr.y, cr.w, Math.max(0, iy1 - cr.y)); setMask(dom.maskBot, cr.x, iy2, cr.w, Math.max(0, cr.y + cr.h - iy2)); setMask(dom.maskLeft, cr.x, iy1, Math.max(0, ix1 - cr.x), iy2 - iy1); setMask(dom.maskRight, ix2, iy1, Math.max(0, cr.x + cr.w - ix2), iy2 - iy1);
    const padT = Math.max(0, -s.y), padB = Math.max(0, s.y + s.h - srcH), padL = Math.max(0, -s.x), padR = Math.max(0, s.x + s.w - srcW);
    const outW = Math.round(s.w), outH = Math.round(s.h);
    dom.sizeLabel.textContent = `${outW} × ${outH}`;
    dom.sizeLabel.style.display = "block"; dom.sizeLabel.style.left = (cr.x + cr.w / 2) + "px"; dom.sizeLabel.style.top = (cr.y + cr.h - 18) + "px";
    const showPad = (el, text, show, cx, cy) => { el.textContent = text; el.style.display = show ? "block" : "none"; if (show) { el.style.left = cx + "px"; el.style.top = cy + "px"; el.style.transform = "translate(-50%,-50%)"; } };
    showPad(dom.padLabelT, `▲ ${Math.round(padT)}`, padT > 0.5, cr.x + cr.w / 2, cr.y + (padT * st.scale) / 2); 
    showPad(dom.padLabelB, `▼ ${Math.round(padB)}`, padB > 0.5, cr.x + cr.w / 2, cr.y + cr.h - (padB * st.scale) / 2); 
    showPad(dom.padLabelL, `◀ ${Math.round(padL)}`, padL > 0.5, cr.x + (padL * st.scale) / 2, cr.y + cr.h / 2); 
    showPad(dom.padLabelR, `▶ ${Math.round(padR)}`, padR > 0.5, cr.x + cr.w - (padR * st.scale) / 2, cr.y + cr.h / 2);
    
    if (document.activeElement !== dom.wInput) dom.wInput.value = outW || ""; if (document.activeElement !== dom.hInput) dom.hInput.value = outH || "";
    const actualAR = st.arLocked ? st.cropAR : s.w / s.h;
    for (const btn of dom.chipBtns) { const chipAR = parseFloat(btn.dataset.chipAR); const active = Math.abs(chipAR - actualAR) < 0.005; btn.style.borderColor = active ? "#5090cc" : "#444"; btn.style.color = active ? "#aadaff" : "#999"; btn.style.background = active ? "#1a3050" : "#222"; }
    if (document.activeElement !== dom.maskColorInput.hexInput) { dom.maskColorInput.picker.value = st.maskColor; dom.maskColorInput.swatch.style.background = st.maskColor; dom.maskColorInput.hexInput.value = st.maskColor.toUpperCase(); }
    if (document.activeElement !== dom.bgColorInput.hexInput) { dom.bgColorInput.picker.value = st.bgColor; dom.bgColorInput.swatch.style.background = st.bgColor; dom.bgColorInput.hexInput.value = st.bgColor.toUpperCase(); }
    updateMaskColors(st, dom);
}

function fitCropInView(st, dom) { const wrapW = dom.wrap.clientWidth, wrapH = dom.wrap.clientHeight; if (wrapW <= 0 || wrapH <= 0) return; const pad = MARGIN; const bx1 = Math.min(st.sf.x, st.cr.x), by1 = Math.min(st.sf.y, st.cr.y), bx2 = Math.max(st.sf.x + st.sf.w, st.cr.x + st.cr.w), by2 = Math.max(st.sf.y + st.sf.h, st.cr.y + st.cr.h); const bw = bx2 - bx1, bh = by2 - by1; const fitZoom = Math.min((wrapW - pad * 2) / bw, (wrapH - pad * 2) / bh); const needsZoomOut = fitZoom < st.view.zoom; const z = needsZoomOut ? Math.max(0.15, fitZoom) : st.view.zoom; const scL = bx1 * z + st.view.panX, scT = by1 * z + st.view.panY, scR = bx2 * z + st.view.panX, scB = by2 * z + st.view.panY; const outOfBounds = scL < 0 || scT < 0 || scR > wrapW || scB > wrapH; if (!needsZoomOut && !outOfBounds) return; st.view.zoom = z; st.view.panX = (wrapW - bw * z) / 2 - bx1 * z; st.view.panY = (wrapH - bh * z) / 2 - by1 * z; }
function syncWidgets(st, widgets, node) { const s = quantizeSrc(crToSrc(st.cr, st.sf, st.scale)); const hex = st.maskColor.replace("#", ""); const mR = parseInt(hex.substring(0,2), 16), mG = parseInt(hex.substring(2,4), 16), mB = parseInt(hex.substring(4,6), 16); 
    if (widgets.cropState) widgets.cropState.value = `${s.x},${s.y},${s.w},${s.h},0,0,${mR},${mG},${mB}`; 
    if (node.graph) node.graph.setDirtyCanvas(true, true); }
function setArLocked(st, dom, locked) { st.arLocked = locked; if (locked && st.cr.h > 0) st.cropAR = st.cr.w / st.cr.h; dom.arBtn.textContent = locked ? "🔒" : "🔓"; dom.arBtn.style.border = `1px solid ${locked ? "#99c0ee" : "#444"}`; dom.arBtn.style.background = locked ? "#1a3a5a" : "#2a2a2a"; dom.arBtn.style.color = locked ? "#aadaff" : "#bbb"; dom.arBtn._active = locked; }
function wireColors(st, dom, widgets, node) { const bind = (inputObj, stateKey) => { inputObj.picker.addEventListener("input", (e) => { st[stateKey] = e.target.value; inputObj.swatch.style.background = e.target.value; inputObj.hexInput.value = e.target.value.toUpperCase(); updateMaskColors(st, dom); syncWidgets(st, widgets, node); }); inputObj.hexInput.addEventListener("change", (e) => { let val = e.target.value; if (!val.startsWith("#")) val = "#" + val; if (/^#[0-9A-F]{6}$/i.test(val)) { st[stateKey] = val; inputObj.picker.value = val; inputObj.swatch.style.background = val; updateMaskColors(st, dom); syncWidgets(st, widgets, node); } }); }; bind(dom.maskColorInput, 'maskColor'); bind(dom.bgColorInput, 'bgColor'); }

function calcSizeByRatio(srcW, srcH, targetAR) {
    let newW, newH;
    let tryH = srcW / targetAR;
    if (tryH >= srcH) {
        newW = srcW;
        newH = tryH;
    } else {
        newH = srcH;
        newW = srcH * targetAR;
    }
    newW = Math.max(GRID, Math.ceil(newW / GRID) * GRID);
    newH = Math.max(GRID, Math.ceil(newH / GRID) * GRID);
    return { w: newW, h: newH };
}

function wireInteractions(st, dom, widgets, node, nodeId) {
    const { wrap, arBtn, snapBtns, wInput, hInput, resetBtn, chipBtns, batchBtn, savePresetBtn, applyPresetBtn, presetListOverlay, presetNameInput, inputField, inputOk, inputCancel } = dom;
    
    savePresetBtn.addEventListener("click", () => { dom.presetListOverlay.style.display = "none"; dom.presetNameInput.style.display = "block"; dom.inputField.value = ""; dom.inputField.focus(); });
    const performSave = () => { 
        const name = dom.inputField.value.trim(); 
        if (!name) return; 
        const s = quantizeSrc(crToSrc(st.cr, st.sf, st.scale)); 
        const hex = st.maskColor.replace("#", ""); 
        const mR = parseInt(hex.substring(0,2), 16), mG = parseInt(hex.substring(2,4), 16), mB = parseInt(hex.substring(4,6), 16); 
        const presetData = { crop_state: `${s.x},${s.y},${s.w},${s.h},0,0,${mR},${mG},${mB}`, maskColor: st.maskColor, bgColor: st.bgColor, outW: 0, outH: 0, cropAR: st.cropAR, arLocked: st.arLocked }; 
        fetch("/rs_outpaint/save_preset", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ name, preset_data: presetData }) 
        }).then(r => { 
            dom.presetNameInput.style.display = "none"; 
            dom.noDataMsg.textContent = r.ok ? `✅ Preset "${name}" saved!` : "❌ Save failed"; 
            dom.noDataMsg.style.display = "flex"; 
            setTimeout(() => { dom.noDataMsg.style.display = "none"; }, 2000); 
        }).catch(e => { 
            dom.noDataMsg.textContent = "❌ Error: " + e.message; 
            dom.noDataMsg.style.display = "flex"; 
            setTimeout(() => { dom.noDataMsg.style.display = "none"; }, 2000); 
        }); 
    };
    inputOk.addEventListener("click", performSave); 
    inputCancel.addEventListener("click", () => { dom.presetNameInput.style.display = "none"; }); 
    inputField.addEventListener("keydown", (e) => { if(e.key === "Enter") performSave(); if(e.key === "Escape") dom.presetNameInput.style.display = "none"; });

    applyPresetBtn.addEventListener("click", async () => {
        dom.presetNameInput.style.display = "none";
        if (dom.presetListOverlay.style.display === "flex") { dom.presetListOverlay.style.display = "none"; return; }
        dom.presetListOverlay.innerHTML = "<div style='padding:8px;color:#999;text-align:center;'>Loading...</div>";
        dom.presetListOverlay.style.display = "flex";
        try {
            const res = await fetch("/rs_outpaint/list_presets", { method: "POST", headers: {"Content-Type": "application/json"} });
            const list = await res.json();
            dom.presetListOverlay.innerHTML = "";
            if (!list.length) { dom.presetListOverlay.textContent = "No presets found"; return; }
            list.forEach(name => {
                const row = document.createElement("div");
                row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #333;";
                const nameSpan = document.createElement("span");
                nameSpan.textContent = name; nameSpan.style.cssText = "flex:1;cursor:pointer;color:#ccc;font-size:12px;";
                nameSpan.onmouseenter = () => nameSpan.style.background = "#3a3a3a"; nameSpan.onmouseleave = () => nameSpan.style.background = "transparent";
                nameSpan.onclick = async () => {
                    dom.presetListOverlay.style.display = "none";
                    if (st.srcW < 32 || st.srcH < 32) { dom.noDataMsg.textContent = "⚠️ Wait for image to load first"; dom.noDataMsg.style.display = "flex"; setTimeout(() => dom.noDataMsg.style.display = "none", 2000); return; }
                    try {
                        const res2 = await fetch("/rs_outpaint/load_preset", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name }) });
                        if (!res2.ok) throw new Error("Load failed");
                        const data = await res2.json();
                        st.maskColor = data.maskColor || "#ff0000"; st.bgColor = data.bgColor || "#141414"; st.outW = 0; st.outH = 0; st.cropAR = data.cropAR || 16/9; st.arLocked = data.arLocked !== undefined ? data.arLocked : true;
                        setArLocked(st, dom, st.arLocked);
                        dom.maskColorInput.picker.value = st.maskColor; dom.maskColorInput.swatch.style.background = st.maskColor; dom.maskColorInput.hexInput.value = st.maskColor.toUpperCase();
                        dom.bgColorInput.picker.value = st.bgColor; dom.bgColorInput.swatch.style.background = st.bgColor; dom.bgColorInput.hexInput.value = st.bgColor.toUpperCase();
                        if(data.crop_state) { const parts = data.crop_state.split(',').map(Number); if(parts.length >= 4) { let s = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }; s = quantizeSrc(s); s = clampToValid(s, st.srcW, st.srcH); st.cr = srcToCr(s, st.sf, st.scale); } }
                        updateMaskColors(st, dom); fitCropInView(st, dom); render(st, dom); syncWidgets(st, widgets, node);
                    } catch(e) { dom.noDataMsg.textContent = "❌ " + e.message; dom.noDataMsg.style.display = "flex"; setTimeout(() => dom.noDataMsg.style.display = "none", 2000); }
                };
                const deleteBtn = document.createElement("span");
                deleteBtn.textContent = "❌"; deleteBtn.style.cssText = "cursor:pointer;margin-left:8px;font-size:14px;opacity:0.7;";
                deleteBtn.onmouseenter = () => { deleteBtn.style.opacity = "1"; deleteBtn.style.transform = "scale(1.2)"; };
                deleteBtn.onmouseleave = () => { deleteBtn.style.opacity = "0.7"; deleteBtn.style.transform = "scale(1)"; };
                deleteBtn.onclick = async (e) => {
                    e.stopPropagation();
                    try {
                        const res3 = await fetch("/rs_outpaint/delete_preset", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name }) });
                        if (res3.ok) { applyPresetBtn.click(); dom.noDataMsg.textContent = `🗑️ Preset "${name}" deleted`; dom.noDataMsg.style.display = "flex"; setTimeout(() => dom.noDataMsg.style.display = "none", 2000); }
                        else { dom.noDataMsg.textContent = "❌ Delete failed"; dom.noDataMsg.style.display = "flex"; setTimeout(() => dom.noDataMsg.style.display = "none", 2000); }
                    } catch(e) { dom.noDataMsg.textContent = "❌ Error: " + e.message; dom.noDataMsg.style.display = "flex"; setTimeout(() => dom.noDataMsg.style.display = "none", 2000); }
                };
                row.appendChild(nameSpan); row.appendChild(deleteBtn);
                dom.presetListOverlay.appendChild(row);
            });
        } catch(e) { dom.presetListOverlay.textContent = "Error loading"; }
    });
    
    document.addEventListener("click", (e) => { if (!dom.presetListOverlay?.contains(e.target) && !dom.applyPresetBtn?.contains(e.target)) dom.presetListOverlay.style.display = "none"; if (!dom.presetNameInput?.contains(e.target) && e.target !== dom.savePresetBtn) dom.presetNameInput.style.display = "none"; });
    batchBtn.addEventListener("click", async () => { st.batchMode = !st.batchMode; dom.batchBtn.dataset.active = st.batchMode ? "true" : "false"; if (st.batchMode) { dom.batchBtn.style.borderColor = "#28a745"; dom.batchBtn.style.background = "#1a2a1a"; dom.batchBtn.style.color = "#aaffaa"; dom.batchBtn.textContent = "⚙️ BATCH ON"; } else { dom.batchBtn.style.borderColor = "#444"; dom.batchBtn.style.background = "#2a2a2a"; dom.batchBtn.style.color = "#bbb"; dom.batchBtn.textContent = "⚙️ BATCH"; } try { await fetch("/rs_outpaint/batch_toggle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: String(node.id), enabled: st.batchMode }) }); } catch(e) {} });
    arBtn.addEventListener("click", () => setArLocked(st, dom, !st.arLocked));
    
    wInput.addEventListener("change", () => { 
        const r = Math.max(GRID, Math.round(parseInt(wInput.value, 10) / GRID) * GRID) || GRID; 
        let s = crToSrc(st.cr, st.sf, st.scale); 
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2; 
        s.w = r; 
        if (st.arLocked) s.h = Math.max(GRID, Math.round(r / st.cropAR / GRID) * GRID); 
        s.x = Math.round((cx - s.w / 2) / GRID) * GRID; 
        s.y = Math.round((cy - s.h / 2) / GRID) * GRID; 
        s = clampToValid(quantizeSrc(s), st.srcW, st.srcH); 
        st.cr = srcToCr(s, st.sf, st.scale); 
        if (!st.arLocked) st.cropAR = s.w / s.h; 
        fitCropInView(st, dom); 
        render(st, dom); 
        syncWidgets(st, widgets, node);
        unapprove(st, dom, nodeId); // ТВОЙ ПЛАН
    });
    
    hInput.addEventListener("change", () => { 
        const r = Math.max(GRID, Math.round(parseInt(hInput.value, 10) / GRID) * GRID) || GRID; 
        let s = crToSrc(st.cr, st.sf, st.scale); 
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2; 
        s.h = r; 
        if (st.arLocked) s.w = Math.max(GRID, Math.round(r * st.cropAR / GRID) * GRID); 
        s.x = Math.round((cx - s.w / 2) / GRID) * GRID; 
        s.y = Math.round((cy - s.h / 2) / GRID) * GRID; 
        s = clampToValid(quantizeSrc(s), st.srcW, st.srcH); 
        st.cr = srcToCr(s, st.sf, st.scale); 
        if (!st.arLocked) st.cropAR = s.w / s.h; 
        fitCropInView(st, dom); 
        render(st, dom); 
        syncWidgets(st, widgets, node);
        unapprove(st, dom, nodeId); // ТВОЙ ПЛАН
    });
    
    resetBtn.addEventListener("click", async () => {
        resetBtn.disabled = true;
        resetBtn.textContent = "⏳ Resetting...";
        
        try {
            await fetch("/rs_outpaint/cleanup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node_id: String(node.id) })
            });
            
            // Сбрасываем локальное состояние
            st.approved = false;
            st.srcHash = null;
            if (widgets.cropState) widgets.cropState.value = "";
            
            initLayout(st, dom.wrap);
            setArLocked(st, dom, false);
            fitCropInView(st, dom);
            render(st, dom);
            syncWidgets(st, widgets, node);
            
            // Скрываем интерфейс редактирования
            dom.waitingMsg.style.display = "none";
            dom.acceptBtn.style.display = "none";
            dom.cancelBtn.style.display = "none";
            dom.batchBtn.style.display = "none";
            dom.resetBtn.style.display = "none";
            
        } catch (err) {
            console.error("Reset failed:", err);
        } finally {
            resetBtn.disabled = false;
            resetBtn.textContent = "🔄️ Reset";
        }
    });
    
    for (const btn of chipBtns) { 
        btn.addEventListener("click", () => { 
            const targetAR = parseFloat(btn.dataset.chipAR);
            setArLocked(st, dom, true);
            st.cropAR = targetAR;
            
            const { w: newW, h: newH } = calcSizeByRatio(st.srcW, st.srcH, targetAR);
            
            const centerX = st.srcW / 2;
            const centerY = st.srcH / 2;
            
            let s = {
                x: Math.round((centerX - newW / 2) / GRID) * GRID,
                y: Math.round((centerY - newH / 2) / GRID) * GRID,
                w: newW,
                h: newH
            };
            
            s = clampToValid(quantizeSrc(s), st.srcW, st.srcH);
            st.cr = srcToCr(s, st.sf, st.scale);
            
            fitCropInView(st, dom); 
            render(st, dom); 
            syncWidgets(st, widgets, node);
            unapprove(st, dom, nodeId); // ТВОЙ ПЛАН
        }); 
    }
    
    for (const btn of snapBtns) { 
        btn.addEventListener("click", () => { 
            const mode = btn.dataset.snap; 
            let s = crToSrc(st.cr, st.sf, st.scale); 
            const { srcW, srcH } = st; 
            if (mode === "center") { s.x = Math.round((srcW - s.w) / 2 / GRID) * GRID; s.y = Math.round((srcH - s.h) / 2 / GRID) * GRID; } 
            else if (mode === "top") s.y = 0; 
            else if (mode === "bottom") s.y = Math.round((srcH - s.h) / GRID) * GRID; 
            else if (mode === "fitW") { s.w = srcW; if (st.arLocked) s.h = Math.round(s.w / st.cropAR / GRID) * GRID; s.x = 0; s.y = Math.round((srcH - s.h) / 2 / GRID) * GRID; } 
            else if (mode === "fitH") { s.h = srcH; if (st.arLocked) s.w = Math.round(s.h * st.cropAR / GRID) * GRID; s.y = 0; s.x = Math.round((srcW - s.w) / 2 / GRID) * GRID; } 
            else if (mode === "left") s.x = 0; 
            else if (mode === "right") s.x = Math.round((srcW - s.w) / GRID) * GRID; 
            s = clampToValid(quantizeSrc(s), st.srcW, st.srcH); 
            st.cr = srcToCr(s, st.sf, st.scale); 
            if (!st.arLocked) st.cropAR = s.w / s.h; 
            render(st, dom); 
            syncWidgets(st, widgets, node);
            unapprove(st, dom, nodeId); // ТВОЙ ПЛАН
        }); 
    }
    
    wrap.addEventListener("wheel", e => { e.preventDefault(); const rect = wrap.getBoundingClientRect(); const sx = e.clientX - rect.left, sy = e.clientY - rect.top; const factor = e.deltaY < 0 ? 1.12 : (1 / 1.12); const newZoom = clamp(st.view.zoom * factor, 0.15, 5.0); st.view.panX = sx - (sx - st.view.panX) * (newZoom / st.view.zoom); st.view.panY = sy - (sy - st.view.panY) * (newZoom / st.view.zoom); st.view.zoom = newZoom; render(st, dom); }, { passive: false });
    dom.zoomIndicator.addEventListener("click", () => { st.view = { zoom: Infinity, panX: 0, panY: 0 }; fitCropInView(st, dom); render(st, dom); });
    let drag = null; let pan = null;
    wrap.addEventListener("pointerdown", e => { if (e.button === 1) { pan = { sx: e.clientX, sy: e.clientY, ox: st.view.panX, oy: st.view.panY }; wrap.setPointerCapture(e.pointerId); e.preventDefault(); return; } const handle = e.target.closest("[data-dir]"); const inBox = dom.cropBox.contains(e.target); if (!handle && !inBox) return; e.preventDefault(); wrap.setPointerCapture(e.pointerId); const wc = toWorld(e, wrap, st.view); drag = { type: handle ? "resize" : "move", dir: handle?.dataset.dir, sx: wc.x, sy: wc.y, sb: { ...st.cr }, ar: st.arLocked ? st.cropAR : null }; });
    wrap.addEventListener("pointermove", e => { if (pan) { st.view.panX = pan.ox + (e.clientX - pan.sx); st.view.panY = pan.oy + (e.clientY - pan.sy); render(st, dom); return; } if (!drag) return; const wc = toWorld(e, wrap, st.view); const dx = wc.x - drag.sx; const dy = wc.y - drag.sy; const minPx = MIN_DRAG_PX; if (drag.type === "move") { applyCanvasCr({ x: drag.sb.x + dx, y: drag.sb.y + dy, w: drag.sb.w, h: drag.sb.h }, st); render(st, dom); return; } let { x, y, w, h } = { ...drag.sb }; const { dir, ar } = drag; if (dir === "br") { w = Math.max(minPx, w + dx); h = ar ? Math.round(w / ar) : Math.max(minPx, h + dy); } else if (dir === "bl") { const nw = Math.max(minPx, w - dx); x += w - nw; w = nw; h = ar ? Math.round(w / ar) : Math.max(minPx, h + dy); } else if (dir === "tr") { w = Math.max(minPx, w + dx); const nh = ar ? Math.round(w / ar) : Math.max(minPx, h - dy); y += h - nh; h = nh; } else if (dir === "tl") { const nw = Math.max(minPx, w - dx); x += w - nw; w = nw; const nh = ar ? Math.round(w / ar) : Math.max(minPx, h - dy); y += h - nh; h = nh; } else if (dir === "t") { const nh = Math.max(minPx, h - dy); const nw = ar ? Math.round(nh * ar) : w; if (ar) x += Math.round((w - nw) / 2); y += h - nh; h = nh; w = nw; } else if (dir === "b") { const nh = Math.max(minPx, h + dy); const nw = ar ? Math.round(nh * ar) : w; if (ar) x += Math.round((w - nw) / 2); h = nh; w = nw; } else if (dir === "l") { const nw = Math.max(minPx, w - dx); const nh = ar ? Math.round(nw / ar) : h; if (ar) y += Math.round((h - nh) / 2); x += w - nw; w = nw; h = nh; } else if (dir === "r") { const nw = Math.max(minPx, w + dx); const nh = ar ? Math.round(nw / ar) : h; if (ar) y += Math.round((h - nh) / 2); w = nw; h = nh; } applyCanvasCr({ x, y, w, h }, st); render(st, dom); });
    wrap.addEventListener("pointerup", e => { if (pan) { pan = null; return; } if (!drag) return; const type = drag.type; if (type === "resize" && st.arLocked) { let s = crToSrc(st.cr, st.sf, st.scale); s = quantizeSrc(s); s.h = Math.max(GRID, Math.round(s.w / st.cropAR / GRID) * GRID); s = clampToValid(s, st.srcW, st.srcH); st.cr = srcToCr(s, st.sf, st.scale); } if (type === "resize" && !st.arLocked) { const s = crToSrc(st.cr, st.sf, st.scale); st.cropAR = s.w / s.h; } if (type === "resize") fitCropInView(st, dom); drag = null; render(st, dom); syncWidgets(st, widgets, node); unapprove(st, dom, nodeId); }); // ТВОЙ ПЛАН
    wrap.addEventListener("pointercancel", () => { pan = null; drag = null; });
}

api.addEventListener("status", (e) => { 
    const remaining = e.detail?.exec_info?.queue_remaining;
    if (remaining > 0) {
        queueWasRunning = true;
        if (batchResetTimer) { clearTimeout(batchResetTimer); batchResetTimer = null; }
    } else if (remaining === 0 && queueWasRunning) { 
        queueWasRunning = false; 
        if (!batchResetTimer) {
            batchResetTimer = setTimeout(() => {
                allNodes.forEach(({st, dom, widgets, node}) => {
                    if (st.batchMode || st.hasPreset) {
                        st.batchMode = false;
                        st.hasPreset = false;
                        dom.batchBtn.dataset.active = "false";
                        dom.batchBtn.style.borderColor = "#444";
                        dom.batchBtn.style.background = "#2a2a2a";
                        dom.batchBtn.style.color = "#bbb";
                        dom.batchBtn.textContent = "⚙️ BATCH";
                        fetch("/rs_outpaint/clear_preset", { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json" }, 
                            body: JSON.stringify({ node_id: String(node.id) }) 
                        }).catch(err => console.error("Failed to clear preset:", err));
                        resetNodeState(st, dom, widgets, node.id);
                        dom.noDataMsg.textContent = "🔄 Batch complete. Node reset.";
                        dom.noDataMsg.style.display = "flex";
                        setTimeout(() => { dom.noDataMsg.style.display = "none"; }, 3000);
                    }
                });
                batchResetTimer = null;
            }, 2000); 
        }
    } 
});

app.registerExtension({
    name: "RSOutpaint",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function () {
            const result = origOnNodeCreated?.apply(this, arguments);
            const node = this;
            const widgets = { cropState: node.widgets?.find(w => w.name === "crop_state") };
            if (widgets.cropState) { widgets.cropState.hidden = true; widgets.cropState.computeSize = () => [0, -4]; }
            if (node.inputs) { for (let i = node.inputs.length - 1; i >= 0; i--) { if (node.inputs[i].name === "crop_state") node.removeInput(i); } }
            const st = createState();
            const dom = buildUI();
            wireColors(st, dom, widgets, node);
            
            setUIActive(dom, false);
            
            const domWidget = node.addDOMWidget("rs_outpaint_canvas", "custom", dom.root, { serialize: false, hideOnZoom: false });
            domWidget.computeSize = () => [520, CANVAS_H + CTRL_H];
            node.setSize([Math.max(node.size[0], 540), Math.max(node.size[1], CANVAS_H + CTRL_H + 10)]);
            node.heartbeatInterval = null;
            node.startHeartbeat = function() { if (this.heartbeatInterval) clearInterval(this.heartbeatInterval); this.heartbeatInterval = setInterval(async () => { try { await fetch("/rs_outpaint/heartbeat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: String(this.id) }) }); } catch (e) {} }, 3000); };
            node.stopHeartbeat = function() { if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; } };
            allNodes.push({st, dom, widgets, node});
            
            const onShow = (event) => { 
                const data = event.detail || event; 
                const { node_id, image_width, image_height, is_new_image, src_hash } = data; 
                if (String(node_id) !== String(node.id)) return; 
                
                const isSameImage = st.initialized && st.srcHash === src_hash;

                if (isSameImage) {
                    // То же изображение – обновляем картинку
                    const tempUrl = api.apiURL(`/view?filename=rsoutpaint_${node_id}.png&type=temp&subfolder=rsoutpaint&t=${Date.now()}`);
                    const img = new Image();
                    img.onload = () => {
                        dom.imageEl.src = tempUrl;
                        dom.imageEl.style.display = "block";
                        
                        if (st.approved) {
                            dom.waitingMsg.style.display = "none";
                            dom.acceptBtn.style.display = "none";
                            dom.cancelBtn.style.display = "none";
                            dom.batchBtn.style.display = "none";
                            dom.resetBtn.style.display = "block";
                            
                            setUIActive(dom, false);
                            dom.resetBtn.style.opacity = "1";
                            dom.resetBtn.style.pointerEvents = "auto";
                            dom.resetBtn.style.filter = "none";
                        } else {
                            dom.waitingMsg.style.display = "flex";
                            dom.acceptBtn.style.display = "block";
                            dom.cancelBtn.style.display = "block";
                            dom.batchBtn.style.display = "block";
                            dom.acceptBtn.disabled = false;
                            dom.acceptBtn.textContent = "✔️ ACCEPT";
                            dom.resetBtn.style.display = "none";
                        }
                        fitCropInView(st, dom);
                        render(st, dom);
                        if (!st.approved) {
                            setUIActive(dom, true);
                        }
                    };
                    img.src = tempUrl;
                    return;
                }

                // Новое изображение – полный сброс
                resetNodeState(st, dom, widgets);
                st.srcW = image_width;
                st.srcH = image_height;
                st.srcHash = src_hash;

                const hasActivePreset = st.batchMode && st.hasPreset;
                if (initLayout(st, dom.wrap)) {
                    if (hasActivePreset) {
                        dom.waitingMsg.style.display = "none";
                        dom.noDataMsg.style.display = "flex";
                        dom.noDataMsg.textContent = `🔄 Applying saved crop to ${image_width}×${image_height}...`;
                        dom.acceptBtn.style.display = "none";
                        dom.cancelBtn.style.display = "none";
                        dom.batchBtn.style.display = "none";
                        dom.resetBtn.style.display = "none";
                        
                        const tempUrl = api.apiURL(`/view?filename=rsoutpaint_${node_id}.png&type=temp&subfolder=rsoutpaint&t=${Date.now()}`);
                        const img = new Image();
                        img.onload = () => {
                            dom.imageEl.src = tempUrl;
                            dom.imageEl.style.display = "block";
                            fitCropInView(st, dom);
                            render(st, dom);
                            (async () => {
                                try {
                                    await fetch("/rs_outpaint/decision", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ node_id: String(node.id), decision: "approve", crop_state: "", batch_mode: true })
                                    });
                                    node.startHeartbeat();
                                    dom.noDataMsg.textContent = `✅ Batch: ${image_width}×${image_height} processed`;
                                    setTimeout(() => { dom.noDataMsg.style.display = "none"; }, 1000);
                                } catch (err) {
                                    console.error("Batch auto-approve failed:", err);
                                }
                            })();
                        };
                        img.src = tempUrl;
                        node.startHeartbeat();
                    } else {
                        dom.waitingMsg.style.display = "flex";
                        dom.noDataMsg.style.display = "none";
                        dom.acceptBtn.style.display = "block";
                        dom.cancelBtn.style.display = "block";
                        dom.batchBtn.style.display = "block";
                        dom.acceptBtn.disabled = false;
                        dom.acceptBtn.textContent = "✔️ ACCEPT";
                        dom.batchBtn.textContent = "⚙️ BATCH";
                        dom.batchBtn.style.borderColor = "#444";
                        dom.batchBtn.style.background = "#2a2a2a";
                        dom.batchBtn.style.color = "#bbb";
                        dom.batchBtn.dataset.active = "false";
                        dom.resetBtn.style.display = "none";
                        
                        const tempUrl = api.apiURL(`/view?filename=rsoutpaint_${node_id}.png&type=temp&subfolder=rsoutpaint&t=${Date.now()}`);
                        const img = new Image();
                        img.onload = () => {
                            dom.imageEl.src = tempUrl;
                            dom.imageEl.style.display = "block";
                            fitCropInView(st, dom);
                            render(st, dom);
                        };
                        img.src = tempUrl;
                        node.startHeartbeat();
                    }
                    setUIActive(dom, true);
                }
            };
            api.addEventListener("rs_outpaint.show", onShow);

            dom.acceptBtn.addEventListener("click", async () => { 
                const s = quantizeSrc(crToSrc(st.cr, st.sf, st.scale)); 
                const mR = parseInt(st.maskColor.slice(1,3), 16), mG = parseInt(st.maskColor.slice(3,5), 16), mB = parseInt(st.maskColor.slice(5,7), 16); 
                const cropState = `${s.x},${s.y},${s.w},${s.h},0,0,${mR},${mG},${mB}`; 
                dom.acceptBtn.textContent = "⏳ Sending..."; 
                dom.acceptBtn.disabled = true; 
                try { 
                    const resp = await fetch("/rs_outpaint/decision", { 
                        method: "POST", 
                        headers: { "Content-Type": "application/json" }, 
                        body: JSON.stringify({ 
                            node_id: String(node.id), 
                            decision: "approve", 
                            crop_state: cropState, 
                            batch_mode: st.batchMode,
                            src_hash: st.srcHash // <-- ДОБАВЛЕНО
                        }) 
                    }); 
                    if (resp.ok) { 
                        node.stopHeartbeat(); 
                        st.approved = true;

                        if (st.batchMode) { 
                            st.hasPreset = true; 
                            dom.waitingMsg.style.display = "none"; 
                            dom.acceptBtn.style.display = "none"; 
                            dom.cancelBtn.style.display = "none"; 
                            dom.batchBtn.style.display = "none"; 
                            dom.noDataMsg.textContent = "💾 Crop preset saved! Ready for batch."; 
                            dom.noDataMsg.style.display = "flex"; 
                            setTimeout(() => { dom.noDataMsg.style.display = "none"; }, 2000); 
                        } else { 
                            dom.acceptBtn.style.display = "none";
                            dom.cancelBtn.style.display = "none";
                            dom.waitingMsg.style.display = "none";
                            dom.batchBtn.style.display = "none";
                            dom.resetBtn.style.display = "block";  // <-- ДОБАВИТЬ

                            dom.noDataMsg.textContent = "✅ Crop applied!";
                            dom.noDataMsg.style.display = "flex";
                            setTimeout(() => { dom.noDataMsg.style.display = "none"; }, 1500);
                        }  
                        setUIActive(dom, false);
                    } 
                } catch (err) { 
                    console.error("Accept failed:", err); 
                } 
            });

            dom.cancelBtn.addEventListener("click", async () => { 
                node.stopHeartbeat(); 
                resetNodeState(st, dom, widgets, node.id); // ТВОЙ ПЛАН: сброс при отмене
                try { 
                    await fetch("/rs_outpaint/cleanup", { 
                        method: "POST", 
                        headers: { "Content-Type": "application/json" }, 
                        body: JSON.stringify({ node_id: String(node.id) }) 
                    }); 
                } catch(e){} 
                try { 
                    await api.interrupt(); 
                } catch(e){} 
                setUIActive(dom, false);
            });

            wireInteractions(st, dom, widgets, node, String(node.id));
            requestAnimationFrame(() => { requestAnimationFrame(() => { if (!st.initialized && initLayout(st, dom.wrap)) { fitCropInView(st, dom); render(st, dom); syncWidgets(st, widgets, node); } }); });
            
            node._outpaintCleanup = () => { 
                api.removeEventListener("rs_outpaint.show", onShow); 
                node.stopHeartbeat(); 
                allNodes = allNodes.filter(n => n.node !== node);
                fetch("/rs_outpaint/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: String(node.id) }) }).catch(() => {}); 
            };
            const origOnRemoved = node.onRemoved;
            node.onRemoved = function () { 
                st.batchMode = false; 
                st.hasPreset = false;
                fetch("/rs_outpaint/clear_preset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: String(node.id) }) }).catch(() => {}); 
                node._outpaintCleanup?.(); 
                if (origOnRemoved) origOnRemoved.call(this); 
            };
            return result;
        };
    },
});