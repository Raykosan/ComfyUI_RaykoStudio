import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

let activeNodeId = null;

const HEAVY_PARAMS = ['text', 'font_name', 'outline_thickness', 'effect_mode', 'text_scale_x', 'text_scale_y', 'text_align', 'line_spacing', 'letter_spacing', 'enable_glow', 'glow_color', 'glow_size', 'glow_spread', 'glow_opacity'];
const GLOW_PARAMS = ['enable_glow', 'glow_color', 'glow_size', 'glow_spread', 'glow_opacity'];
const SHADOW_PARAMS = ['enable_shadow', 'shadow_color', 'shadow_offset_x', 'shadow_offset_y', 'shadow_opacity', 'shadow_blur'];

const DEFAULT_EFFECTS = {
  outline: {
    outline_thickness: 0,
    outline_color: "#808080",
    outline_opacity: 1.0
  },
  glow: {
    enable_glow: false,
    glow_color: "#FFFFFF",
    glow_size: 100,
    glow_spread: 150,
    glow_opacity: 1.0
  },
  shadow: {
    enable_shadow: false,
    shadow_color: "#333333",
    shadow_offset_x: 10,
    shadow_offset_y: 10,
    shadow_opacity: 0.8,
    shadow_blur: 15
  }
};

app.registerExtension({
  name: "RaykoStudio.RSOverlayPro",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "RS_OverlayPro") return;

    function createColorPickerRow(node, labelText, paramName, defaultColor) {
      const container = document.createElement('div');
      container.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;';
      const label = document.createElement('div');
      label.textContent = labelText;
      label.style.cssText = 'flex:6;font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;';
      const hexInput = document.createElement('input');
      hexInput.type = 'text';
      hexInput.value = defaultColor;
      hexInput.style.cssText = 'flex:3.5;padding:4px 6px;background:#1a1a1a;color:#fff;border:1px solid #444;border-radius:4px;font-family:monospace;font-size:11px;outline:none;transition:0.15s;';
      hexInput.onmouseenter = () => { hexInput.style.borderColor = '#666'; };
      hexInput.onmouseleave = () => { if (document.activeElement !== hexInput) hexInput.style.borderColor = '#444'; };
      hexInput.onfocus = () => { hexInput.style.borderColor = '#4CAF50'; };
      hexInput.onblur = () => { hexInput.style.borderColor = '#444'; validateAndUpdate(); };
      hexInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); validateAndUpdate(); hexInput.blur(); } };
      const colorBox = document.createElement('div');
      colorBox.style.cssText = 'flex:0 0 24px;width:24px;height:24px;background:' + defaultColor + ';border:1px solid #444;border-radius:4px;position:relative;cursor:pointer;transition:0.15s;';
      colorBox.onmouseenter = () => { colorBox.style.borderColor = '#888'; };
      colorBox.onmouseleave = () => { colorBox.style.borderColor = '#444'; };
      const nativePicker = document.createElement('input');
      nativePicker.type = 'color';
      nativePicker.value = defaultColor;
      nativePicker.style.cssText = 'opacity:0;width:100%;height:100%;position:absolute;top:0;left:0;cursor:pointer;';
      nativePicker.oninput = (e) => {
        const color = e.target.value.toUpperCase();
        hexInput.value = color;
        colorBox.style.background = color;
        node.textParams[paramName] = color;
        if (typeof node.scheduleRender === 'function') node.scheduleRender(paramName);
        node.syncAllWidgets();
      };
      colorBox.appendChild(nativePicker);
      function validateAndUpdate() {
        let value = hexInput.value.trim();
        if (!value.startsWith('#')) value = '#' + value;
        const hexRegex = /^#([0-9A-Fa-f]{3}){1,2}$/;
        if (hexRegex.test(value)) {
          if (value.length === 4) value = '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
          value = value.toUpperCase();
          hexInput.value = value;
          colorBox.style.background = value;
          nativePicker.value = value;
          node.textParams[paramName] = value;
          if (typeof node.scheduleRender === 'function') node.scheduleRender(paramName);
          node.syncAllWidgets();
        } else {
          hexInput.value = node.textParams[paramName] || defaultColor;
        }
      }
      container.appendChild(label);
      container.appendChild(hexInput);
      container.appendChild(colorBox);
      if (!node.colorHexInputs) node.colorHexInputs = {};
      if (!node.colorBoxes) node.colorBoxes = {};
      node.colorHexInputs[paramName] = hexInput;
      node.colorBoxes[paramName] = colorBox;
      return container;
    }

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      if (onNodeCreated) onNodeCreated.apply(this, arguments);

      this.overlay = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };
      this.overlayRelative = { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0 };
      this.realOverlay = { width: 0, height: 0 };
      this.realBackground = { width: 0, height: 0 };
      this.displayWidth = 420;
      this.displayHeight = 420;
      this.canvasPixelSize = 420;
      this.viewScale = 1.0;
      this.viewOffsetX = 0;
      this.viewOffsetY = 0;
      this.backgroundImage = null;
      this.isEditing = false;
      this.isLoading = false;
      this.dragType = null;
      this.dragState = null;
      this.currentSessionTimestamp = null;
      this.isDragging = false;
      this.awaitingServerRender = false;
      this.debug = false;
      this.textMask = null;
      this.outlineMask = null;
      this._offCanvas = null;
      this._offCtx = null;
      this.baseWidth = 0;
      this.baseHeight = 0;
      this._glowMask = null;
      this._textMaskFile = null;
      this._glowMaskTimeout = null;
      this._glowMaskTimestamp = null;
      this._glowExtraPadding = 0;
      this.glowPaddingPreview = 0;
      this._glowMaskAbortController = null;
      this._glowKey = null;
      this._glowDrawLogged = false;
      this._glowFallbackLogged = false;
      this._shadowMask = null;
      this._shadowMaskTimeout = null;
      this._shadowMaskTimestamp = null;
      this._shadowMaskAbortController = null;
      this._shadowKey = null;
      this.colorHexInputs = {};
      this.colorBoxes = {};
      this._updatingWidgets = false;
      this._sectionStates = { text: true, outline: false, glow: false, shadow: false };

      this.textParams = {
        text: "",
        font_name: "",
        text_color: "#FFFFFF",
        outline_thickness: 0,
        outline_color: "#808080",
        text_opacity: 1.0,
        outline_opacity: 1.0,
        effect_mode: "on",
        text_scale_x: 1.0,
        text_scale_y: 1.0,
        min_font_size: 4,
        max_font_size: 2000,
        padding: 5,
        padding_y: 10,
        text_align: "center",
        line_spacing: 1.0,
        letter_spacing: 0.0,
        enable_glow: false,
        glow_color: "#FFFFFF",
        glow_size: 100,
        glow_spread: 150,
        glow_opacity: 1.0,
        enable_shadow: false,
        shadow_color: "#333333",
        shadow_offset_x: 10,
        shadow_offset_y: 10,
        shadow_opacity: 0.8,
        shadow_blur: 15
      };

      this.fontList = [];
      this.advancedMode = false;
      this.fontMenu = null;

      (async () => {
        try {
          const response = await api.fetchApi("/rayko/rs_overlay_pro/get_fonts");
          const data = await response.json();
          if (data.font_list && data.font_list.length > 0) {
            this.fontList = data.font_list;
            if (!this.textParams.font_name || this.textParams.font_name === "") {
              this.textParams.font_name = data.default_font || this.fontList[0];
            }
            if (this.overlayInputs && this.overlayInputs.font_name) {
              this.overlayInputs.font_name.innerHTML = '';
              this.fontList.forEach(f => {
                const op = document.createElement('option');
                op.value = f;
                op.textContent = f;
                if (f === this.textParams.font_name) op.selected = true;
                this.overlayInputs.font_name.appendChild(op);
              });
            }
            this.setDirtyCanvas(true);
          }
        } catch(e) {
          console.error("Failed to load font list:", e);
        }
      })();

      this.overlayContainer = null;
      this.overlayCanvas = null;
      this.overlayCtx = null;
      this.overlayRenderLoop = null;
      this.overlayInputs = {};
      this.sliderDisplays = {};
      this.currentRenderAbortController = null;
      this.canvasRealWidth = 0;
      this.canvasRealHeight = 0;
      this.minWidth = 500;
      this.minHeight = 420;
      this.setSize([this.minWidth, this.minHeight]);

      this.btnApplyHover = false;
      this.btnCancelHover = false;
      this.textareaState = { isOpen: false, element: null };
      this.textareaRect = null;
      this.textareaHover = false;
      this.lastClickCoords = null;
      this.fontSelectRect = null;
      this.hexRect = null;
      this.colorBoxRect = null;
      this.fontSelectHover = false;
      this.hexHover = false;
      this.colorBoxHover = false;
      this.alignButtonsRects = [];
      this.alignButtonsHover = [false, false, false];
      this.lineSpacingRect = null;
      this.lineSpacingHover = false;
      this.lineSpacingDragging = false;
      this.lineSpacingPopup = null;
      this.lineSpacingValueRect = null;
      this.lineSpacingValueHover = false;
      this.lineSpacingTrackRect = null;
      this.fontColorY = 0;
      this.buttonsY = 0;
      this.pendingEditorData = null;
      this.renderTimeout = null;

      this.syncAllWidgets = function() {
        if (this._updatingWidgets) return;
        this._updatingWidgets = true;
        try {
          if (this.overlayInputs.text) this.overlayInputs.text.value = this.textParams.text || '';
          if (this.overlayInputs.font_name) this.overlayInputs.font_name.value = this.textParams.font_name || '';
          for (const key in this.overlayInputs) {
            const el = this.overlayInputs[key];
            if (!el) continue;
            if (el.type === 'range') {
              el.value = this.textParams[key];
              if (this.sliderDisplays[key]) {
                const step = parseFloat(el.step) || 1;
                this.sliderDisplays[key].textContent = step < 1 ? parseFloat(this.textParams[key]).toFixed(2) : String(parseInt(this.textParams[key]));
              }
            } else if (el.type === 'checkbox') {
              el.checked = !!this.textParams[key];
            }
          }
          if (this.alignButtons) {
            const align = this.textParams.text_align || 'center';
            this.alignButtons.forEach((btn, i) => {
              const types = ['left', 'center', 'right'];
              const isActive = types[i] === align;
              if (isActive) {
                btn.style.background = '#4CAF50';
                btn.style.color = '#fff';
                btn.style.borderColor = '#4CAF50';
              } else {
                btn.style.background = '#252525';
                btn.style.color = '#aaa';
                btn.style.borderColor = '#444';
              }
            });
          }
          if (this.colorHexInputs) {
            for (const key in this.colorHexInputs) {
              const hexInput = this.colorHexInputs[key];
              const colorBox = this.colorBoxes[key];
              if (hexInput && this.textParams[key] !== undefined) {
                hexInput.value = this.textParams[key];
                if (colorBox) colorBox.style.background = this.textParams[key];
              }
            }
          }
        } finally {
          this._updatingWidgets = false;
        }
      };

      if (!this.overlayContainer) {
        this.overlayContainer = document.createElement('div');
        this.overlayContainer.style.cssText = 'position:fixed;top:60px;left:0;right:0;bottom:0;background:rgba(10,10,10,0.96);z-index:999;display:none;flex-direction:row;align-items:stretch;font-family:system-ui,-apple-system,sans-serif;';

        this.overlayCanvasWrapper = document.createElement('div');
        this.overlayCanvasWrapper.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;';

        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.style.cssText = 'box-shadow:0 8px 32px rgba(0,0,0,0.7);cursor:crosshair;max-width:98%;max-height:98%;border-radius:8px;';
        this.overlayCanvasWrapper.appendChild(this.overlayCanvas);
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        this.sidePanel = document.createElement('div');
        this.sidePanel.style.cssText = 'width:320px;background:#151515;border-left:1px solid #333;padding:12px;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;overflow-y:auto;';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'position:sticky;top:0;background:#151515;z-index:10;padding:0 0 8px 0;border-bottom:1px solid #333;margin-bottom:8px;';
        this.sidePanel.appendChild(buttonContainer);

        const makeLabel = (txt) => {
          const l = document.createElement('label');
          l.textContent = txt;
          l.style.cssText = 'color:#aaa;font-size:11px;font-weight:600;margin-bottom:-4px;display:block;';
          return l;
        };

        const makeSectionHeader = (label, effectName, isEnabled, onToggle, onExpand) => {
          const header = document.createElement('div');
          header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;user-select:none;';
          
          const chevron = document.createElement('span');
          chevron.textContent = '▶';
          chevron.style.cssText = 'color:#666;font-size:12px;transition:transform 200ms;flex-shrink:0;';
          
          const lbl = document.createElement('label');
          lbl.textContent = label;
          lbl.style.cssText = `flex:1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;transition:color 200ms;`;
          lbl.style.color = isEnabled ? '#00FF00' : '#666';
          
          header.appendChild(chevron);
          header.appendChild(lbl);
          
          if (effectName) {
            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = isEnabled;
            toggle.style.cssText = 'width:40px;height:20px;cursor:pointer;accent-color:#4CAF50;';
            toggle.addEventListener('change', (e) => {
              e.stopPropagation();
              onToggle(toggle.checked);
            });
            header.appendChild(toggle);
          }
          
          header.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
              onExpand();
            }
          });
          
          return { header, chevron, lbl };
        };

        const makeSelect = (opts, val) => {
          const s = document.createElement('select');
          opts.forEach(o => {
            const op = document.createElement('option');
            op.value = o;
            op.textContent = o;
            if (o === val) op.selected = true;
            s.appendChild(op);
          });
          s.style.cssText = 'width:100%;background:#252525;color:#eee;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px;outline:none;';
          return s;
        };

        const makeTextarea = (value) => {
          const t = document.createElement('textarea');
          t.value = value;
          t.style.cssText = 'width:100%;background:#252525;color:#eee;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px;outline:none;resize:vertical;min-height:60px;';
          return t;
        };

        const makeBtn = (txt, col, onClick) => {
          const b = document.createElement('button');
          b.textContent = txt;
          b.style.cssText = `width:100%;padding:10px;background:#222;color:${col};border:1px solid ${col};border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;margin-top:4px;transition:0.15s;`;
          b.onmouseenter = () => { b.style.background = '#2a2a2a'; b.style.transform = 'translateY(-1px)'; };
          b.onmouseleave = () => { b.style.background = '#222'; b.style.transform = 'none'; };
          b.onclick = (e) => { e.stopPropagation(); onClick(); };
          return b;
        };

        const div = () => { const d = document.createElement('div'); d.style.cssText = 'height:1px;background:#333;margin:4px 0;'; return d; };

        const formatValue = (val, step) => {
          if (step < 1) return parseFloat(val).toFixed(2);
          return String(parseInt(val));
        };

        const makeToggle = (label, key, currentValue) => {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
          const lbl = document.createElement('label');
          lbl.textContent = label;
          lbl.style.cssText = 'flex:1;color:#aaa;font-size:11px;font-weight:600;';
          const toggle = document.createElement('input');
          toggle.type = 'checkbox';
          toggle.checked = currentValue;
          toggle.style.cssText = 'width:40px;height:20px;cursor:pointer;accent-color:#4CAF50;';
          toggle.addEventListener('change', () => {
            this.textParams[key] = toggle.checked;
            scheduleRender(key);
            this.syncAllWidgets();
          });
          wrap.appendChild(lbl);
          wrap.appendChild(toggle);
          this.overlayInputs[key] = toggle;
          return wrap;
        };

        const scheduleRender = (key, immediate = false) => {
          if (SHADOW_PARAMS.includes(key)) {
            this.setDirtyCanvas(true);
            this.syncAllWidgets();
            this.requestShadowMask();
            return;
          }
          const isHeavy = HEAVY_PARAMS.includes(key);
          const isGlowParam = GLOW_PARAMS.includes(key);
          if (isHeavy && !isGlowParam) {
            if (this.currentRenderAbortController) {
              this.currentRenderAbortController.abort();
              this.currentRenderAbortController = null;
            }
            if (this.renderTimeout) clearTimeout(this.renderTimeout);
            const delay = immediate ? 0 : 40;
            this.renderTimeout = setTimeout(() => {
              this.currentRenderAbortController = new AbortController();
              const signal = this.currentRenderAbortController.signal;
              this.renderMasks(signal);
            }, delay);
          } else if (isGlowParam) {
            this.requestGlowMask();
          } else {
            this.setDirtyCanvas(true);
          }
          this.syncAllWidgets();
        };
        this.scheduleRender = scheduleRender;

        const makeSlider = (label, key, min, max, step, isFloat = false) => {
          const container = document.createElement('div');
          container.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
          const lbl = document.createElement('label');
          lbl.textContent = label;
          lbl.style.cssText = 'color:#aaa;font-size:11px;font-weight:600;';
          container.appendChild(lbl);
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;';
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = min;
          slider.max = max;
          slider.step = step;
          slider.value = this.textParams[key];
          slider.style.cssText = 'flex:1;height:4px;background:#252525;border-radius:2px;outline:none;cursor:pointer;-webkit-appearance:none;';
          const valueDisplay = document.createElement('div');
          valueDisplay.textContent = formatValue(this.textParams[key], step);
          valueDisplay.style.cssText = 'min-width:50px;text-align:center;background:#252525;color:#4CAF50;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;font-weight:600;transition:0.15s;';
          valueDisplay.onmouseenter = () => { valueDisplay.style.background = '#2a2a2a'; valueDisplay.style.borderColor = '#4CAF50'; };
          valueDisplay.onmouseleave = () => { valueDisplay.style.background = '#252525'; valueDisplay.style.borderColor = '#444'; };
          valueDisplay.onclick = (e) => {
            e.stopPropagation();
            const currentValue = this.textParams[key];
            const popup = document.createElement('div');
            popup.style.cssText = 'position:fixed;z-index:10003;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:8px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;';
            const input = document.createElement('input');
            input.type = 'number';
            input.value = currentValue;
            input.min = min;
            input.max = max;
            input.step = step;
            input.style.cssText = 'width:100px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:12px;outline:none;';
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'OK';
            saveBtn.style.cssText = 'background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;';
            const doSave = () => {
              let num = isFloat ? parseFloat(input.value) : parseInt(input.value);
              if (isNaN(num)) num = currentValue;
              num = Math.max(min, Math.min(max, num));
              this.textParams[key] = num;
              slider.value = num;
              valueDisplay.textContent = formatValue(num, step);
              popup.remove();
              scheduleRender(key);
              this.syncAllWidgets();
            };
            saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); doSave(); };
            input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doSave(); } };
            popup.appendChild(input);
            popup.appendChild(saveBtn);
            document.body.appendChild(popup);
            const popupWidth = popup.offsetWidth;
            const popupHeight = popup.offsetHeight;
            let leftPos = e.clientX - popupWidth - 8;
            let topPos = e.clientY;
            if (leftPos < 8) leftPos = e.clientX + 8;
            if (topPos + popupHeight > window.innerHeight - 8) topPos = window.innerHeight - popupHeight - 8;
            popup.style.left = leftPos + 'px';
            popup.style.top = topPos + 'px';
            setTimeout(() => { input.focus(); input.select(); }, 50);
            setTimeout(() => {
              const closeHandler = (ev) => {
                if (!popup.contains(ev.target)) {
                  popup.remove();
                  document.removeEventListener('mousedown', closeHandler);
                }
              };
              document.addEventListener('mousedown', closeHandler);
            }, 100);
          };
          slider.oninput = () => {
            const val = isFloat ? parseFloat(slider.value) : parseInt(slider.value);
            this.textParams[key] = val;
            valueDisplay.textContent = formatValue(val, step);
            scheduleRender(key);
            this.syncAllWidgets();
          };
          this.overlayInputs[key] = slider;
          this.sliderDisplays[key] = valueDisplay;
          row.appendChild(slider);
          row.appendChild(valueDisplay);
          container.appendChild(row);
          return container;
        };

        const btnNormalMode = makeBtn("🟢 NORMAL MODE", "#2196F3", () => { this._toggleAdvancedMode(); });
        buttonContainer.appendChild(btnNormalMode);
        const btnApply = makeBtn("✔️ APPLY", "#4CAF50", () => { this.sendTransforms(); this._toggleAdvancedMode(); });
        buttonContainer.appendChild(btnApply);
        const btnCancel = makeBtn("❌ CANCEL", "#dc3545", () => { this.cancelEditing(); this._toggleAdvancedMode(); });
        buttonContainer.appendChild(btnCancel);

        const textHeader = document.createElement('div');
        textHeader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;';
        const textChevron = document.createElement('span');
        textChevron.textContent = '▼';
        textChevron.style.cssText = 'color:#666;font-size:12px;';
        const textLabel = document.createElement('label');
        textLabel.textContent = 'TEXT';
        textLabel.style.cssText = 'flex:1;color:#aaa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;';
        textHeader.appendChild(textChevron);
        textHeader.appendChild(textLabel);
        this.sidePanel.appendChild(textHeader);

        const textContent = document.createElement('div');
        textContent.style.cssText = 'display:block;';

        this.overlayInputs.text = makeTextarea(this.textParams.text);
        this.overlayInputs.text.addEventListener('input', () => {
          this.textParams.text = this.overlayInputs.text.value;
          scheduleRender('text');
          this.syncAllWidgets();
        });
        textContent.appendChild(this.overlayInputs.text);

        const alignContainer = document.createElement('div');
        alignContainer.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
        const alignTypes = ['left', 'center', 'right'];
        const alignIcons = [
          '<svg width="20" height="20" viewBox="0 0 20 20"><line x1="2" y1="5" x2="18" y2="5" stroke="currentColor" stroke-width="2"/><line x1="2" y1="10" x2="12" y2="10" stroke="currentColor" stroke-width="2"/><line x1="2" y1="15" x2="15" y2="15" stroke="currentColor" stroke-width="2"/></svg>',
          '<svg width="20" height="20" viewBox="0 0 20 20"><line x1="2" y1="5" x2="18" y2="5" stroke="currentColor" stroke-width="2"/><line x1="5" y1="10" x2="15" y2="10" stroke="currentColor" stroke-width="2"/><line x1="3" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="2"/></svg>',
          '<svg width="20" height="20" viewBox="0 0 20 20"><line x1="2" y1="5" x2="18" y2="5" stroke="currentColor" stroke-width="2"/><line x1="8" y1="10" x2="18" y2="10" stroke="currentColor" stroke-width="2"/><line x1="5" y1="15" x2="18" y2="15" stroke="currentColor" stroke-width="2"/></svg>'
        ];
        this.alignButtons = [];
        alignTypes.forEach((type, i) => {
          const btn = document.createElement('button');
          btn.innerHTML = alignIcons[i];
          btn.style.cssText = `flex:1;padding:4px;background:#252525;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:0.15s;`;
          btn.onmouseenter = () => { btn.style.background = '#2a2a2a'; btn.style.color = '#fff'; };
          btn.onmouseleave = () => { if (this.textParams.text_align !== type) { btn.style.background = '#252525'; btn.style.color = '#aaa'; } };
          btn.onclick = (e) => {
            e.stopPropagation();
            this.textParams.text_align = type;
            this.alignButtons.forEach((b, j) => {
              if (j === i) {
                b.style.background = '#4CAF50';
                b.style.color = '#fff';
                b.style.borderColor = '#4CAF50';
              } else {
                b.style.background = '#252525';
                b.style.color = '#aaa';
                b.style.borderColor = '#444';
              }
            });
            scheduleRender('text_align');
            this.syncAllWidgets();
          };
          if (this.textParams.text_align === type) {
            btn.style.background = '#4CAF50';
            btn.style.color = '#fff';
            btn.style.borderColor = '#4CAF50';
          }
          this.alignButtons.push(btn);
          alignContainer.appendChild(btn);
        });
        textContent.appendChild(alignContainer);
        textContent.appendChild(div());

        this.overlayInputs.font_name = makeSelect([], "");
        this.overlayInputs.font_name.addEventListener('change', () => {
          this.textParams.font_name = this.overlayInputs.font_name.value;
          scheduleRender('font_name');
          this.syncAllWidgets();
        });
        textContent.appendChild(this.overlayInputs.font_name);
        textContent.appendChild(div());

        textContent.appendChild(createColorPickerRow(this, "TEXT COLOR", "text_color", this.textParams.text_color));
        textContent.appendChild(div());
        textContent.appendChild(makeSlider("TEXT OPACITY", "text_opacity", 0, 1, 0.05, true));
        textContent.appendChild(makeSlider("LINE SPACING", "line_spacing", 0.5, 3, 0.1, true));
        textContent.appendChild(makeSlider("LETTER SPACING", "letter_spacing", -20, 100, 0.5, true));
        textContent.appendChild(div());

        this.sidePanel.appendChild(textContent);

        const outlineHeader = document.createElement('div');
        outlineHeader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;user-select:none;';
        const outlineChevron = document.createElement('span');
        outlineChevron.textContent = this._sectionStates.outline ? '▼' : '▶';
        outlineChevron.style.cssText = 'color:#666;font-size:12px;transition:transform 200ms;flex-shrink:0;';
        const outlineLabel = document.createElement('label');
        outlineLabel.textContent = 'OUTLINE SETTINGS';
        outlineLabel.style.cssText = `flex:1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;transition:color 200ms;`;
        outlineLabel.style.color = this.textParams.outline_thickness > 0 ? '#00FF00' : '#666';
        outlineHeader.appendChild(outlineChevron);
        outlineHeader.appendChild(outlineLabel);
        outlineHeader.addEventListener('click', () => {
          this._sectionStates.outline = !this._sectionStates.outline;
          outlineChevron.textContent = this._sectionStates.outline ? '▼' : '▶';
          outlineContent.style.display = this._sectionStates.outline ? 'block' : 'none';
        });
        this.sidePanel.appendChild(outlineHeader);

        const outlineContent = document.createElement('div');
        outlineContent.style.cssText = this._sectionStates.outline ? 'display:block;' : 'display:none;';
        outlineContent.appendChild(div());
        outlineContent.appendChild(makeSlider("THICKNESS", "outline_thickness", 0, 50, 1, false));
        outlineContent.appendChild(createColorPickerRow(this, "COLOR", "outline_color", this.textParams.outline_color));
        outlineContent.appendChild(div());
        outlineContent.appendChild(makeSlider("OPACITY", "outline_opacity", 0, 1, 0.05, true));
        outlineContent.appendChild(div());
        this.sidePanel.appendChild(outlineContent);

        const glowHeader = document.createElement('div');
        glowHeader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;user-select:none;';
        const glowChevron = document.createElement('span');
        glowChevron.textContent = this._sectionStates.glow ? '▼' : '▶';
        glowChevron.style.cssText = 'color:#666;font-size:12px;transition:transform 200ms;flex-shrink:0;';
        const glowLabel = document.createElement('label');
        glowLabel.textContent = 'GLOW SETTINGS';
        glowLabel.style.cssText = `flex:1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;transition:color 200ms;`;
        glowLabel.style.color = this.textParams.enable_glow ? '#00FF00' : '#666';
        glowHeader.appendChild(glowChevron);
        glowHeader.appendChild(glowLabel);

        const glowToggle = document.createElement('input');
        glowToggle.type = 'checkbox';
        glowToggle.checked = this.textParams.enable_glow;
        glowToggle.style.cssText = 'width:40px;height:20px;cursor:pointer;accent-color:#4CAF50;';
        glowToggle.addEventListener('click', (e) => e.stopPropagation());
        glowToggle.addEventListener('change', (e) => {
          e.stopPropagation();
          const enabled = e.target.checked;
          this.textParams.enable_glow = enabled;
  
          if (!enabled) {
            this.textParams.glow_color = DEFAULT_EFFECTS.glow.glow_color;
            this.textParams.glow_size = DEFAULT_EFFECTS.glow.glow_size;
            this.textParams.glow_spread = DEFAULT_EFFECTS.glow.glow_spread;
            this.textParams.glow_opacity = DEFAULT_EFFECTS.glow.glow_opacity;
          }
  
          glowLabel.style.color = enabled ? '#00FF00' : '#666';
          this.syncAllWidgets();
          scheduleRender('enable_glow');
        });
        glowHeader.appendChild(glowToggle);

        glowHeader.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox') {
            this._sectionStates.glow = !this._sectionStates.glow;
            glowChevron.textContent = this._sectionStates.glow ? '▼' : '▶';
            glowContent.style.display = this._sectionStates.glow ? 'block' : 'none';
          }
        });
        this.sidePanel.appendChild(glowHeader);

        const glowContent = document.createElement('div');
        glowContent.style.cssText = this._sectionStates.glow ? 'display:block;' : 'display:none;';
        glowContent.appendChild(div());
        glowContent.appendChild(createColorPickerRow(this, "GLOW COLOR", "glow_color", this.textParams.glow_color));
        glowContent.appendChild(div());
        glowContent.appendChild(makeSlider("SIZE", "glow_size", 0, 200, 1, false));
        glowContent.appendChild(makeSlider("SPREAD", "glow_spread", 0, 300, 1, false));
        glowContent.appendChild(makeSlider("OPACITY", "glow_opacity", 0, 1, 0.02, true));
        glowContent.appendChild(div());
        this.sidePanel.appendChild(glowContent);

        const shadowHeader = document.createElement('div');
        shadowHeader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;user-select:none;';
        const shadowChevron = document.createElement('span');
        shadowChevron.textContent = this._sectionStates.shadow ? '▼' : '▶';
        shadowChevron.style.cssText = 'color:#666;font-size:12px;transition:transform 200ms;flex-shrink:0;';
        const shadowLabel = document.createElement('label');
        shadowLabel.textContent = 'SHADOW SETTINGS';
        shadowLabel.style.cssText = `flex:1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;transition:color 200ms;`;
        shadowLabel.style.color = this.textParams.enable_shadow ? '#00FF00' : '#666';
        shadowHeader.appendChild(shadowChevron);
        shadowHeader.appendChild(shadowLabel);

        const shadowToggle = document.createElement('input');
        shadowToggle.type = 'checkbox';
        shadowToggle.checked = this.textParams.enable_shadow;
        shadowToggle.style.cssText = 'width:40px;height:20px;cursor:pointer;accent-color:#4CAF50;';
        shadowToggle.addEventListener('click', (e) => e.stopPropagation());
        shadowToggle.addEventListener('change', (e) => {
          e.stopPropagation();
          const enabled = e.target.checked;
          this.textParams.enable_shadow = enabled;
  
          if (!enabled) {
            this.textParams.shadow_color = DEFAULT_EFFECTS.shadow.shadow_color;
            this.textParams.shadow_offset_x = DEFAULT_EFFECTS.shadow.shadow_offset_x;
            this.textParams.shadow_offset_y = DEFAULT_EFFECTS.shadow.shadow_offset_y;
            this.textParams.shadow_opacity = DEFAULT_EFFECTS.shadow.shadow_opacity;
            this.textParams.shadow_blur = DEFAULT_EFFECTS.shadow.shadow_blur;
          }
  
          shadowLabel.style.color = enabled ? '#00FF00' : '#666';
          this.syncAllWidgets();
          scheduleRender('enable_shadow');
        });
        shadowHeader.appendChild(shadowToggle);

        shadowHeader.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox') {
            this._sectionStates.shadow = !this._sectionStates.shadow;
            shadowChevron.textContent = this._sectionStates.shadow ? '▼' : '▶';
            shadowContent.style.display = this._sectionStates.shadow ? 'block' : 'none';
          }
        });
        this.sidePanel.appendChild(shadowHeader);

        const shadowContent = document.createElement('div');
        shadowContent.style.cssText = this._sectionStates.shadow ? 'display:block;' : 'display:none;';
        shadowContent.appendChild(div());
        shadowContent.appendChild(createColorPickerRow(this, "COLOR", "shadow_color", this.textParams.        shadow_color));
        shadowContent.appendChild(div());
        shadowContent.appendChild(makeSlider("OFFSET X", "shadow_offset_x", -30, 30, 1, false));
        shadowContent.appendChild(makeSlider("OFFSET Y", "shadow_offset_y", -30, 30, 1, false));
        shadowContent.appendChild(makeSlider("BLUR", "shadow_blur", 0, 100, 1, false));
        shadowContent.appendChild(makeSlider("OPACITY", "shadow_opacity", 0, 1, 0.05, true));
        shadowContent.appendChild(div());
        this.sidePanel.appendChild(shadowContent);

        this.overlayContainer.appendChild(this.overlayCanvasWrapper);
        this.overlayContainer.appendChild(this.sidePanel);
        document.body.appendChild(this.overlayContainer);

        this.syncAllWidgets();
      }

      api.addEventListener("rs-overlay-pro-start", (event) => {
        if (event.detail.id != this.id) return;
        this.pendingEditorData = event.detail;
        this.openDeferredEditor();
      });

      api.addEventListener("interrupted", () => {
        if (this.currentRenderAbortController) {
          this.currentRenderAbortController.abort();
          this.currentRenderAbortController = null;
        }
        if (this._glowMaskTimeout) {
          clearTimeout(this._glowMaskTimeout);
          this._glowMaskTimeout = null;
        }
        if (this._glowMaskAbortController) {
          this._glowMaskAbortController.abort();
          this._glowMaskAbortController = null;
        }
        if (this._shadowMaskTimeout) {
          clearTimeout(this._shadowMaskTimeout);
          this._shadowMaskTimeout = null;
        }
        if (this._shadowMaskAbortController) {
          this._shadowMaskAbortController.abort();
          this._shadowMaskAbortController = null;
        }
        this.pendingEditorData = null;
        this.isLoading = false;
        this.isEditing = false;
        this.dragType = null;
        this.dragState = null;
        this.awaitingServerRender = false;
        this._glowMask = null;
        this._textMaskFile = null;
        this._glowKey = null;
        this._shadowMask = null;
        this._shadowKey = null;
        this._sectionStates = { text: true, outline: false, glow: false, shadow: false };
        this.setDirtyCanvas(true);
        this.closeTextarea();
      });
    };

    nodeType.prototype.requestGlowMask = function() {
      if (!this.textParams.enable_glow) {
        this._glowMask = null;
        this._glowExtraPadding = 0;
        this.glowPaddingPreview = 0;
        this._glowKey = null;
        this.setDirtyCanvas(true);
        return;
      }
      if (!this.textMask || !this._textMaskFile) return;
      const glowSize = this.textParams.glow_size;
      const glowSpread = this.textParams.glow_spread;
      if (glowSize <= 0) {
        this._glowMask = null;
        this._glowExtraPadding = 0;
        this.glowPaddingPreview = 0;
        this._glowKey = null;
        this.setDirtyCanvas(true);
        return;
      }
      const glowKey = `${this._textMaskFile}_${glowSize}_${glowSpread}_${this.textParams.glow_opacity}_${this.textParams.glow_color}`;
      if (this._glowKey === glowKey && this._glowMask) return;
      this._glowKey = glowKey;
      const glowPadding = glowSize * (this.displayWidth / this.canvasRealWidth);
      this.glowPaddingPreview = glowPadding;
      clearTimeout(this._glowMaskTimeout);
      this._glowMaskTimeout = setTimeout(() => {
        this.fetchGlowMaskFromServer();
      }, 500);
    };
    
    nodeType.prototype.fetchGlowMaskFromServer = async function() {
      try {
        if (this._glowMaskAbortController) this._glowMaskAbortController.abort();
        this._glowMaskAbortController = new AbortController();
        const payload = {
          text_mask_file: this._textMaskFile,
          glow_size: this.textParams.glow_size,
          glow_spread: this.textParams.glow_spread,
          glow_opacity: this.textParams.glow_opacity,
          node_id: String(this.id)
        };
        const response = await api.fetchApi('/rayko/rs_overlay_pro/render_glow_mask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: this._glowMaskAbortController.signal
        });
        const data = await response.json();
        if (data.glow_file) {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          const ts = data.timestamp;
          this._glowMaskTimestamp = ts;
          this._glowExtraPadding = data.extra_padding || 0;
          img.onload = () => {
            if (this._glowMaskTimestamp === ts) {
              this._glowMask = img;
              this._glowDrawLogged = false;
              this._glowFallbackLogged = false;
              this.setDirtyCanvas(true);
            }
          };
          img.onerror = () => {};
          img.src = `/view?filename=${data.glow_file}&type=temp&t=${ts}`;
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    };

    nodeType.prototype.requestShadowMask = function() {
      if (!this.textParams.enable_shadow) {
        this._shadowMask = null;
        this._shadowKey = null;
        this.setDirtyCanvas(true);
        return;
      }
      if (!this.textMask || !this._textMaskFile) return;
      const shadowBlur = this.textParams.shadow_blur || 0;
      if (shadowBlur <= 0) {
        this._shadowMask = null;
        this._shadowKey = null;
        this.setDirtyCanvas(true);
        return;
      }
      const shadowKey = `${this._textMaskFile}_${shadowBlur}`;
      if (this._shadowKey === shadowKey && this._shadowMask) return;
      this._shadowKey = shadowKey;
      clearTimeout(this._shadowMaskTimeout);
      this._shadowMaskTimeout = setTimeout(() => {
        this.fetchShadowMaskFromServer();
      }, 500);
    };

    nodeType.prototype.fetchShadowMaskFromServer = async function() {
      try {
        if (this._shadowMaskAbortController) this._shadowMaskAbortController.abort();
        this._shadowMaskAbortController = new AbortController();
        const payload = {
          text_mask_file: this._textMaskFile,
          shadow_blur: this.textParams.shadow_blur || 0,
          node_id: String(this.id)
        };
        const response = await api.fetchApi('/rayko/rs_overlay_pro/render_shadow_mask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: this._shadowMaskAbortController.signal
        });
        const data = await response.json();
        if (data.shadow_file) {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          const ts = data.timestamp;
          this._shadowMaskTimestamp = ts;
          img.onload = () => {
            if (this._shadowMaskTimestamp === ts) {
              this._shadowMask = img;
              this.setDirtyCanvas(true);
            }
          };
          img.onerror = () => {};
          img.src = `/view?filename=${data.shadow_file}&type=temp&t=${ts}`;
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    };

    nodeType.prototype.drawMasked = function(ctx, maskImg, x, y, w, h, color, opacity) {
      if (!maskImg) return;
      if (!this._offCanvas) {
        this._offCanvas = document.createElement('canvas');
        this._offCtx = this._offCanvas.getContext('2d');
      }
      const off = this._offCanvas;
      const offCtx = this._offCtx;
      const mw = maskImg.naturalWidth || maskImg.width || w;
      const mh = maskImg.naturalHeight || maskImg.height || h;
      if (off.width !== mw || off.height !== mh) {
        off.width = mw;
        off.height = mh;
      }
      offCtx.clearRect(0, 0, mw, mh);
      offCtx.drawImage(maskImg, 0, 0, mw, mh);
      offCtx.globalCompositeOperation = 'source-in';
      offCtx.globalAlpha = Math.min(1, Math.max(0, opacity));
      offCtx.fillStyle = color;
      offCtx.fillRect(0, 0, mw, mh);
      offCtx.globalCompositeOperation = 'source-over';
      offCtx.globalAlpha = 1;
      ctx.drawImage(off, x, y, w, h);
    };

    nodeType.prototype.drawGlowPreview = function(ctx, x, y, w, h) {
      if (!this.textParams.enable_glow || !this.textMask) return;
      const glowSize = this.textParams.glow_size;
      if (glowSize <= 0) return;
      const glowOpacity = this.textParams.glow_opacity;
      const glowColor = this.textParams.glow_color;
      if (this._glowMask) {
        const padding = this._glowExtraPadding || 0;
        if (!this._offCanvas) {
          this._offCanvas = document.createElement('canvas');
          this._offCtx = this._offCanvas.getContext('2d');
        }
        const off = this._offCanvas;
        const offCtx = this._offCtx;
        const mw = this._glowMask.naturalWidth;
        const mh = this._glowMask.naturalHeight;
        if (off.width !== mw || off.height !== mh) {
          off.width = mw;
          off.height = mh;
        }
        offCtx.clearRect(0, 0, mw, mh);
        offCtx.drawImage(this._glowMask, 0, 0, mw, mh);
        offCtx.globalCompositeOperation = 'source-in';
        offCtx.globalAlpha = Math.min(1, Math.max(0, glowOpacity));
        offCtx.fillStyle = glowColor;
        offCtx.fillRect(0, 0, mw, mh);
        offCtx.globalCompositeOperation = 'source-over';
        offCtx.globalAlpha = 1;
        const textW = mw - 2 * padding;
        const textH = mh - 2 * padding;
        const scaleX = w / textW;
        const scaleY = h / textH;
        const glowW = mw * scaleX;
        const glowH = mh * scaleY;
        const glowX = x - padding * scaleX;
        const glowY = y - padding * scaleY;
        ctx.drawImage(off, glowX, glowY, glowW, glowH);
        return;
      }
      const maxBlur = Math.min(250, glowSize);
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = maxBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      this.drawMasked(ctx, this.textMask, x, y, w, h, glowColor, glowOpacity);
      ctx.restore();
    };

    nodeType.prototype.drawShadow = function(ctx, x, y, w, h) {
      if (!this.textParams.enable_shadow || !this.textMask) return;
      const opacity = this.textParams.shadow_opacity;
      if (opacity === undefined || opacity === null || opacity <= 0) return;
      const offsetX = this.textParams.shadow_offset_x || 0;
      const offsetY = this.textParams.shadow_offset_y || 0;
      const color = this.textParams.shadow_color || '#333333';
      const blur = this.textParams.shadow_blur || 0;

      if (this._shadowMask && blur > 0) {
        const mw = this._shadowMask.naturalWidth;
        const mh = this._shadowMask.naturalHeight;
        if (!this._offCanvas) {
          this._offCanvas = document.createElement('canvas');
          this._offCtx = this._offCanvas.getContext('2d');
        }
        const off = this._offCanvas;
        const offCtx = this._offCtx;
        if (off.width !== mw || off.height !== mh) {
          off.width = mw;
          off.height = mh;
        }
        offCtx.clearRect(0, 0, mw, mh);
        offCtx.drawImage(this._shadowMask, 0, 0, mw, mh);
        offCtx.globalCompositeOperation = 'source-in';
        offCtx.globalAlpha = Math.min(1, Math.max(0, opacity));
        offCtx.fillStyle = color;
        offCtx.fillRect(0, 0, mw, mh);
        offCtx.globalCompositeOperation = 'source-over';
        offCtx.globalAlpha = 1;
        ctx.drawImage(off, x + offsetX, y + offsetY, w, h);
        return;
      }

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = offsetX;
      ctx.shadowOffsetY = offsetY;
      ctx.globalAlpha = opacity;
      this.drawMasked(ctx, this.textMask, x, y, w, h, color, 1.0);
      ctx.restore();
    };

    nodeType.prototype.drawTextOverlay = function(ctx, x, y, w, h) {
      this.drawGlowPreview(ctx, x, y, w, h);
      this.drawShadow(ctx, x, y, w, h);
      if (this.textParams.effect_mode === "on" && this.outlineMask) {
        this.drawMasked(ctx, this.outlineMask, x, y, w, h,
          this.textParams.outline_color, this.textParams.outline_opacity);
      }
      if (this.textMask) {
        this.drawMasked(ctx, this.textMask, x, y, w, h,
          this.textParams.text_color, this.textParams.text_opacity);
      }
    };

    nodeType.prototype._resizeOverlayCanvas = function() {
      if (!this.overlayCanvasWrapper || !this.overlayCanvas) return;
      const w = this.overlayCanvasWrapper.clientWidth;
      const h = this.overlayCanvasWrapper.clientHeight;
      if (w > 0 && h > 0) {
        this.overlayCanvas.width = w;
        this.overlayCanvas.height = h;
        if (this.isEditing && this.backgroundImage) {
          this.updateOverlayAbsolute();
          this.computeAndApplyView();
        }
        this.setDirtyCanvas(true);
        if (this.advancedMode && this.isEditing) {
          this.computeAndApplyView();
        }
      }
    };

    nodeType.prototype._handleOverlayEvent = function(e, type) {
      e.preventDefault();
      e.stopPropagation();
      const rect = this.overlayCanvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const scaleX = this.overlayCanvas.width / rect.width;
      const scaleY = this.overlayCanvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      if (type === 'down') this.onMouseDown(null, [x, y]);
      else if (type === 'move') this.onMouseMove(null, [x, y]);
      else this.onMouseUp();
      this.setDirtyCanvas(true);
    };

    nodeType.prototype._handleOverlayWheel = function(e) {
      if (!this.advancedMode || !this.isEditing || activeNodeId !== this.id) return;
      e.preventDefault();
      e.stopPropagation();
      const canvasRect = this.overlayCanvas.getBoundingClientRect();
      if (canvasRect.width === 0 || canvasRect.height === 0) return;
      const scaleX = this.overlayCanvas.width / canvasRect.width;
      const scaleY = this.overlayCanvas.height / canvasRect.height;
      const canvasX = (e.clientX - canvasRect.left) * scaleX;
      const canvasY = (e.clientY - canvasRect.top) * scaleY;
      const { rectX, rectY } = this.getCanvasMetrics();
      const worldX = (canvasX - rectX - this.viewOffsetX) / this.viewScale;
      const worldY = (canvasY - rectY - this.viewOffsetY) / this.viewScale;
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.viewScale = Math.max(0.05, Math.min(10.0, this.viewScale * zoomFactor));
      this.viewOffsetX = canvasX - rectX - (worldX * this.viewScale);
      this.viewOffsetY = canvasY - rectY - (worldY * this.viewScale);
      this.setDirtyCanvas(true);
    };

    nodeType.prototype._toggleAdvancedMode = function(forceClose = false) {
      if (this.currentRenderAbortController) {
        this.currentRenderAbortController.abort();
        this.currentRenderAbortController = null;
      }
      if (forceClose || this.advancedMode) {
        this.updateRelativeFromAbsolute();
        this.advancedMode = false;
        if (activeNodeId === this.id) activeNodeId = null;
        this.overlayContainer.style.display = 'none';
        if (this._overlayWheelHandler) {
          this.overlayCanvas.removeEventListener('wheel', this._overlayWheelHandler);
          delete this._overlayWheelHandler;
        }
        if (this._overlayMouseHandler) {
          this.overlayCanvas.removeEventListener('mousedown', this._overlayMouseHandler);
          this.overlayCanvas.removeEventListener('mousemove', this._overlayMouseHandler);
          this.overlayCanvas.removeEventListener('mouseup', this._overlayMouseHandler);
          this.overlayCanvas.removeEventListener('mouseleave', this._overlayMouseLeaveHandler);
          delete this._overlayMouseHandler;
          delete this._overlayMouseLeaveHandler;
        }
        if (this._globalKeyHandler) window.removeEventListener('keydown', this._globalKeyHandler);
        if (this.overlayRenderLoop) cancelAnimationFrame(this.overlayRenderLoop);
        this.setDirtyCanvas(true);
        return;
      }
      if (activeNodeId && activeNodeId !== this.id) {
        const otherNode = app.graph?.nodes.find(n => n.id == activeNodeId);
        if (otherNode && typeof otherNode._toggleAdvancedMode === 'function') {
          otherNode._toggleAdvancedMode(true);
        }
      }
      this.advancedMode = true;
      activeNodeId = this.id;
      this.overlayContainer.style.display = 'flex';
      requestAnimationFrame(() => {
        this._resizeOverlayCanvas();
        this.computeAndApplyView();
      });
      this._overlayMouseHandler = (e) => this._handleOverlayEvent(e, e.type === 'mousedown' ? 'down' : e.type === 'mousemove' ? 'move' : 'up');
      this._overlayMouseLeaveHandler = () => this.onMouseUp();
      this.overlayCanvas.addEventListener('mousedown', this._overlayMouseHandler);
      this.overlayCanvas.addEventListener('mousemove', this._overlayMouseHandler);
      this.overlayCanvas.addEventListener('mouseup', this._overlayMouseHandler);
      this.overlayCanvas.addEventListener('mouseleave', this._overlayMouseLeaveHandler);
      this._overlayWheelHandler = (e) => this._handleOverlayWheel(e);
      this.overlayCanvas.addEventListener('wheel', this._overlayWheelHandler, { passive: false });
      this._globalKeyHandler = (e) => {
        if (e.key === 'Escape' && activeNodeId === this.id) {
          this._toggleAdvancedMode();
        }
      };
      window.addEventListener('keydown', this._globalKeyHandler);
      let lastDrawTime = 0;
      this.overlayRenderLoop = () => {
        if (!this.advancedMode || !this.overlayCtx) return;
        const now = performance.now();
        if (now - lastDrawTime < 50) {
          requestAnimationFrame(this.overlayRenderLoop);
          return;
        }
        lastDrawTime = now;
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.drawOverlayCanvas(this.overlayCtx);
        requestAnimationFrame(this.overlayRenderLoop);
      };
      requestAnimationFrame(this.overlayRenderLoop);
    };

    nodeType.prototype.drawOverlayCanvas = function(ctx) {
      if (!this.isEditing || !this.backgroundImage) {
        ctx.fillStyle = "#888";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Loading...", this.overlayCanvas.width / 2, this.overlayCanvas.height / 2);
        return;
      }
      const { rectX, rectY } = this.getCanvasMetrics();
      const useScale = this.viewScale;
      const useOffsetX = this.viewOffsetX;
      const useOffsetY = this.viewOffsetY;
      ctx.save();
      ctx.translate(rectX + useOffsetX, rectY + useOffsetY);
      ctx.scale(useScale, useScale);
      ctx.drawImage(this.backgroundImage, -this.displayWidth / 2, -this.displayHeight / 2, this.displayWidth, this.displayHeight);
      if (this.textMask) {
        ctx.save();
        ctx.translate(this.overlay.x, this.overlay.y);
        ctx.rotate(this.overlay.rotation * Math.PI / 180);
        const rectW = this.overlay.width;
        const rectH = this.overlay.height;
        this.drawTextOverlay(ctx, -rectW / 2, -rectH / 2, rectW, rectH);
        if (this.advancedMode) {
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 4 / useScale;
          ctx.strokeStyle = "#00FF00";
          ctx.lineWidth = 1 / useScale;
          ctx.strokeRect(-rectW / 2, -rectH / 2, rectW, rectH);
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          const hw = rectW / 2, hh = rectH / 2;
          const hs = 6 / useScale;
          ctx.fillStyle = "#FF0000";
          [[hw, hh], [-hw, hh], [hw, -hh], [-hw, -hh]].forEach(([x, y]) => ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs));
          [[hw, 0], [-hw, 0], [0, hh], [0, -hh]].forEach(([x, y]) => ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs));
          const rotHandleY = -hh - 40;
          ctx.beginPath();
          ctx.arc(0, rotHandleY, 7 / useScale, 0, Math.PI * 2);
          ctx.fillStyle = "#ff9800";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1 / useScale;
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
      if (this.advancedMode) {
        ctx.fillStyle = "#ff9800";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`EDITING (Scale: ${(useScale * 100).toFixed(0)}%)`, this.overlayCanvas.width - 200, this.overlayCanvas.height - 20);
      }
    };

    nodeType.prototype.openDeferredEditor = function() {
      if (!this.pendingEditorData) return;
      const data = this.pendingEditorData;
      this.textMask = null;
      this.outlineMask = null;
      this._glowMask = null;
      this._textMaskFile = null;
      this._glowMaskTimestamp = null;
      this._glowExtraPadding = 0;
      this._glowKey = null;
      this._shadowMask = null;
      this._shadowKey = null;
      this.backgroundImage = null;
      this.isLoading = true;
      this.currentSessionTimestamp = data.timestamp;
      this.textParams.text_scale_x = 1.0;
      this.textParams.text_scale_y = 1.0;
      this.awaitingServerRender = false;
      if (this.fontList.length === 0 && data.font_list && data.font_list.length > 0) {
        this.fontList = data.font_list;
        if (!this.textParams.font_name) {
          this.textParams.font_name = data.default_font || this.fontList[0];
        }
      }
      this.realBackground = { width: data.bg_width, height: data.bg_height };
      this.canvasRealWidth = this.realBackground.width;
      this.canvasRealHeight = this.realBackground.height;
      this.updateDisplaySize(this.canvasPixelSize);
      const bgFile = data.bg_file, ts = data.timestamp;
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        this.backgroundImage = img;
        this.isLoading = false;
        const initialWidth = this.displayWidth;
        const initialHeight = this.displayWidth * (3 / 5);
        this.overlayRelative = {
          width: initialWidth / this.displayWidth,
          height: initialHeight / this.displayHeight,
          x: 0.5,
          y: 0.5,
          rotation: 0
        };
        this.updateOverlayAbsolute();
        this.computeAndApplyView();
        this.isEditing = true;
        this.baseWidth = this.overlay.width;
        this.baseHeight = this.overlay.height;
        this.setDirtyCanvas(true);
        this.renderMasks();
        this.syncAllWidgets();
      };
      img.onerror = () => {
        this.isLoading = false;
      };
      img.src = `/view?filename=${bgFile}&type=temp&t=${ts}`;
    };

    nodeType.prototype.renderMasks = async function(signal = null) {
      if (!this.isEditing || !this.backgroundImage) return;
      const scale = this.realBackground.width / this.displayWidth;
      const containerWidth = Math.round(this.baseWidth * scale);
      const containerHeight = Math.round(this.baseHeight * scale);
      if (containerWidth < 10 || containerHeight < 10) return;
      try {
        const response = await api.fetchApi("/rayko/rs_overlay_pro/render_masks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: String(this.id),
            text_params: this.textParams,
            container_width: containerWidth,
            container_height: containerHeight
          }),
          signal: signal
        });
        const data = await response.json();
        if (data.error) {
          this.awaitingServerRender = false;
          return;
        }
        let loadedCount = 0;
        const totalMasks = 2;
        const checkDone = () => {
          if (loadedCount === totalMasks) {
            this.awaitingServerRender = false;
            this.setDirtyCanvas(true);
            this.requestGlowMask();
            this.requestShadowMask();
          }
        };
        const textImg = new Image();
        textImg.crossOrigin = "Anonymous";
        textImg.onload = () => {
          this.textMask = textImg;
          this._textMaskFile = data.text_mask_file;
          loadedCount++;
          checkDone();
        };
        textImg.onerror = () => {
          loadedCount++;
          checkDone();
        };
        textImg.src = `/view?filename=${data.text_mask_file}&type=temp&t=${data.timestamp}`;

        const outlineImg = new Image();
        outlineImg.crossOrigin = "Anonymous";
        outlineImg.onload = () => {
          this.outlineMask = outlineImg;
          loadedCount++;
          checkDone();
        };
        outlineImg.onerror = () => {
          loadedCount++;
          checkDone();
        };
        outlineImg.src = `/view?filename=${data.outline_mask_file}&type=temp&t=${data.timestamp}`;
      } catch (e) {
        if (e.name === 'AbortError') return;
        this.awaitingServerRender = false;
      }
    };

    nodeType.prototype.updateOverlayAbsolute = function() {
      this.overlay.x = (this.overlayRelative.x - 0.5) * this.displayWidth;
      this.overlay.y = (this.overlayRelative.y - 0.5) * this.displayHeight;
      this.overlay.width = this.overlayRelative.width * this.displayWidth;
      this.overlay.height = this.overlayRelative.height * this.displayHeight;
      this.overlay.rotation = this.overlayRelative.rotation;
    };

    nodeType.prototype.updateRelativeFromAbsolute = function() {
      this.overlayRelative.x = (this.overlay.x / this.displayWidth) + 0.5;
      this.overlayRelative.y = (this.overlay.y / this.displayHeight) + 0.5;
      this.overlayRelative.width = this.overlay.width / this.displayWidth;
      this.overlayRelative.height = this.overlay.height / this.displayHeight;
      this.overlayRelative.rotation = this.overlay.rotation;
    };

    nodeType.prototype.computeAndApplyView = function() {
      const bgW = this.displayWidth, bgH = this.displayHeight;
      const ovW = this.overlay.width, ovH = this.overlay.height;
      const ovL = this.overlay.x - ovW/2, ovT = this.overlay.y - ovH/2;
      const ovR = this.overlay.x + ovW/2, ovB = this.overlay.y + ovH/2;
      const bgL = -bgW/2, bgT = -bgH/2, bgR = bgW/2, bgB = bgH/2;
      const minX = Math.min(ovL, bgL), minY = Math.min(ovT, bgT), maxX = Math.max(ovR, bgR), maxY = Math.max(ovB, bgB);
      const contentW = Math.max(1, maxX - minX), contentH = Math.max(1, maxY - minY);
      const contentCX = (minX + maxX)/2, contentCY = (minY + maxY)/2;
      let glowPadding = this.glowPaddingPreview || 0;
      if (this.advancedMode) {
        const cw = this.overlayCanvas.width || (this.overlayCanvasWrapper ? this.overlayCanvasWrapper.clientWidth : 1000);
        const ch = this.overlayCanvas.height || (this.overlayCanvasWrapper ? this.overlayCanvasWrapper.clientHeight : 800);
        const availableW = cw * 0.8, availableH = ch * 0.8;
        const totalW = contentW + glowPadding*2;
        const totalH = contentH + glowPadding*2;
        this.viewScale = Math.max(0.1, Math.min(3.0, Math.min(availableW/totalW, availableH/totalH)));
        this.viewOffsetX = cw/2 - (contentCX * this.viewScale);
        this.viewOffsetY = ch/2 - (contentCY * this.viewScale);
      } else {
        const availableW = this.canvasPixelSize * 0.95, availableH = this.canvasPixelSize * 0.95;
        const totalW = contentW + glowPadding*2;
        const totalH = contentH + glowPadding*2;
        this.viewScale = Math.max(0.1, Math.min(3.0, Math.min(availableW/totalW, availableH/totalH)));
        this.viewOffsetX = this.canvasPixelSize/2 - (contentCX * this.viewScale);
        this.viewOffsetY = this.canvasPixelSize/2 - (contentCY * this.viewScale);
      }
    };

    nodeType.prototype.updateDisplaySize = function(cS) {
      this.canvasPixelSize = cS;
      const safeHeight = this.realBackground.height || 1;
      const bgAR = this.realBackground.width / safeHeight;
      if (bgAR >= 1) {
        this.displayWidth = cS;
        this.displayHeight = cS / bgAR;
      } else {
        this.displayHeight = cS;
        this.displayWidth = cS * bgAR;
      }
    };

    nodeType.prototype.getRealTransform = function() {
      const dS = this.canvasRealWidth / (this.displayWidth || 1);
      const absX = (this.overlay.x * dS) + (this.canvasRealWidth / 2);
      const absY = (this.overlay.y * dS) + (this.canvasRealHeight / 2);
      const scaleX = this.overlay.width / this.displayWidth;
      const scaleY = this.overlay.height / this.displayHeight;
      const baseWidthPx = this.baseWidth * dS;
      const baseHeightPx = this.baseHeight * dS;
      return {
        x: absX,
        y: absY,
        scale_x: scaleX,
        scale_y: scaleY,
        rotation: this.overlay.rotation,
        base_width_px: baseWidthPx,
        base_height_px: baseHeightPx
      };
    };

    nodeType.prototype.computeScreenHandles = function(rectX, rectY, useScale, useOffsetX, useOffsetY) {
      const hw = this.overlay.width / 2;
      const hh = this.overlay.height / 2;
      const rot = this.overlay.rotation * Math.PI / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const handles = {
        'scale-tl': [-hw, -hh],
        'scale-tr': [hw, -hh],
        'scale-bl': [-hw, hh],
        'scale-br': [hw, hh],
        'scale-t': [0, -hh],
        'scale-b': [0, hh],
        'scale-l': [-hw, 0],
        'scale-r': [hw, 0],
        'rotate': [0, -hh - 40]
      };
      const screenHandles = {};
      for (const [name, loc] of Object.entries(handles)) {
        const rx = loc[0]*cos - loc[1]*sin, ry = loc[0]*sin + loc[1]*cos;
        screenHandles[name] = { x: rectX + useOffsetX + (this.overlay.x + rx)*useScale, y: rectY + useOffsetY + (this.overlay.y + ry)*useScale };
      }
      return screenHandles;
    };

    nodeType.prototype.sendTransforms = async function() {
      if (this.currentRenderAbortController) {
        this.currentRenderAbortController.abort();
        this.currentRenderAbortController = null;
      }
      const transform = this.getRealTransform();
      const scale = this.realBackground.width / this.displayWidth;
      const textParamsWithBase = {
        ...this.textParams,
        base_width_px: transform.base_width_px,
        base_height_px: transform.base_height_px,
        shadow_offset_x: Math.round(this.textParams.shadow_offset_x * scale),
        shadow_offset_y: Math.round(this.textParams.shadow_offset_y * scale),
        shadow_blur: Math.round((this.textParams.shadow_blur || 0) * scale)
      };
      const payload = {
        id: String(this.id),
        transforms: transform,
        text_params: textParamsWithBase
      };
      try {
        await api.fetchApi("/rayko/rs_overlay_pro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        this.isEditing = false;
        this.setDirtyCanvas(true);
      } catch(e) {}
    };

    nodeType.prototype.cancelEditing = async function() {
      if (this.currentRenderAbortController) {
        this.currentRenderAbortController.abort();
        this.currentRenderAbortController = null;
      }
      if (this._glowMaskTimeout) {
        clearTimeout(this._glowMaskTimeout);
        this._glowMaskTimeout = null;
      }
      if (this._glowMaskAbortController) {
        this._glowMaskAbortController.abort();
        this._glowMaskAbortController = null;
      }
      if (this._shadowMaskTimeout) {
        clearTimeout(this._shadowMaskTimeout);
        this._shadowMaskTimeout = null;
      }
      if (this._shadowMaskAbortController) {
        this._shadowMaskAbortController.abort();
        this._shadowMaskAbortController = null;
      }
      try { await api.interrupt(); } catch(e) {}
      await fetch("/rayko/rs_overlay_pro/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: String(this.id) }) });
      this.isEditing = false; this.isLoading = false; this.dragType = null; this.dragState = null; this.awaitingServerRender = false;
      this._glowMask = null; this._textMaskFile = null; this._glowExtraPadding = 0; this._glowKey = null;
      this._shadowMask = null; this._shadowKey = null;
      this.setDirtyCanvas(true);
      this.closeTextarea();
    };

    nodeType.prototype.roundRect = function(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    nodeType.prototype.getNodeScreenCoords = function(localX, localY) {
      try {
        const canvas = LGraphCanvas.active_canvas;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.canvas.getBoundingClientRect();
        const ds = canvas.ds;
        return {
          x: rect.left + (this.pos[0] + localX) * ds.scale + ds.offset[0],
          y: rect.top + (this.pos[1] + localY) * ds.scale + ds.offset[1]
        };
      } catch(e) {
        return { x: 0, y: 0 };
      }
    };

    nodeType.prototype.openTextarea = function(clickEvent) {
      if (this.textareaState.isOpen && this.textareaState.element) {
        this.textareaState.element.remove();
      }
      const currentValue = this.textParams.text || '';
      const popup = document.createElement('div');
      popup.style.cssText = 'position:fixed;z-index:10002;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:10px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
      const input = document.createElement('textarea');
      input.value = currentValue;
      input.style.cssText = 'width:300px;height:150px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:10px;font-size:12px;resize:none;display:block;margin-bottom:10px;';
      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'SAVE';
      saveBtn.style.cssText = 'background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:8px 16px;font-size:14px;cursor:pointer;float:right;';
      saveBtn.onmouseover = () => saveBtn.style.background = "#45a049";
      saveBtn.onmouseout = () => saveBtn.style.background = "#4CAF50";
      popup.appendChild(input);
      popup.appendChild(saveBtn);
      if (clickEvent) {
        popup.style.left = (clickEvent.clientX + 8) + 'px';
        popup.style.top = clickEvent.clientY + 'px';
      }
      document.body.appendChild(popup);
      setTimeout(() => {
        input.focus();
        setTimeout(() => {
          if (currentValue && currentValue.length > 0) input.select();
        }, 10);
      }, 50);
      saveBtn.onclick = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        this.textParams.text = input.value;
        popup.remove();
        this.textareaState.isOpen = false;
        this.textareaState.element = null;
        this.setDirtyCanvas(true);
        if (this.scheduleRender) this.scheduleRender('text');
        this.syncAllWidgets();
      };
      input.onkeydown = (ev) => {
        if (ev.key === 'Enter' && ev.ctrlKey) {
          ev.preventDefault();
          this.textParams.text = input.value;
          popup.remove();
          this.textareaState.isOpen = false;
          this.textareaState.element = null;
          this.setDirtyCanvas(true);
          if (this.scheduleRender) this.scheduleRender('text');
          this.syncAllWidgets();
        }
      };
      this.textareaState.isOpen = true;
      this.textareaState.element = popup;
    };

    nodeType.prototype.closeTextarea = function() {
      if (this.textareaState.element) {
        this.textareaState.element.remove();
        this.textareaState.isOpen = false;
        this.textareaState.element = null;
      }
    };

    nodeType.prototype.showFontSelector = function(clickEvent) {
      if (this.fontMenu) {
        this.fontMenu.remove();
        this.fontMenu = null;
      }
      const list = this.fontList || [];
      if (!list.length) return;
      const buttonBottomLeft = this.getNodeScreenCoords(
        this.fontSelectRect.x,
        this.fontSelectRect.y + this.fontSelectRect.h
      );
      const buttonTopLeft = this.getNodeScreenCoords(
        this.fontSelectRect.x,
        this.fontSelectRect.y
      );
      const menu = document.createElement("div");
      menu.style.cssText = 'position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:6px;max-height:300px;overflow:hidden;z-index:10001;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:200px;display:flex;flex-direction:column;';
      this.fontMenu = menu;
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Search fonts...";
      searchInput.value = "";
      searchInput.style.cssText = 'width:100%;background:#222;color:#eee;border:none;border-bottom:1px solid #333;border-radius:6px 6px 0 0;padding:8px 12px;font-size:12px;outline:none;box-sizing:border-box;';
      const listContainer = document.createElement("div");
      listContainer.style.cssText = 'overflow-y:auto;flex:1;';
      const renderList = (filter) => {
        listContainer.innerHTML = '';
        const lowerFilter = filter.toLowerCase();
        const filtered = list.filter(f => f.toLowerCase().includes(lowerFilter));
        if (filtered.length === 0) {
          const empty = document.createElement("div");
          empty.textContent = "No matches";
          empty.style.cssText = 'padding:10px 15px;color:#666;font-size:12px;font-style:italic;';
          listContainer.appendChild(empty);
          return;
        }
        filtered.forEach(opt => {
          const item = document.createElement("div");
          item.textContent = opt;
          item.style.cssText = 'padding:10px 15px;cursor:pointer;color:#ddd;font-size:12px;border-bottom:1px solid #333;';
          item.onmouseover = () => item.style.background = "#333";
          item.onmouseout = () => item.style.background = "#1a1a1a";
          item.onclick = (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            this.textParams.font_name = opt;
            menu.remove();
            this.fontMenu = null;
            this.setDirtyCanvas(true);
            if (this.scheduleRender) this.scheduleRender('font_name');
            this.syncAllWidgets();
          };
          listContainer.appendChild(item);
        });
      };
      searchInput.addEventListener('input', (e) => {
        renderList(e.target.value);
      });
      searchInput.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      searchInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          menu.remove();
          this.fontMenu = null;
        }
      });
      menu.appendChild(searchInput);
      menu.appendChild(listContainer);
      menu.style.left = buttonBottomLeft.x + 'px';
      menu.style.top = buttonBottomLeft.y + 'px';
      document.body.appendChild(menu);
      renderList('');
      const menuHeight = menu.offsetHeight;
      const menuWidth = menu.offsetWidth;
      let finalLeft = buttonBottomLeft.x;
      let finalTop = buttonBottomLeft.y;
      if (finalTop + menuHeight > window.innerHeight - 10) {
        finalTop = buttonTopLeft.y - menuHeight;
        if (finalTop < 10) finalTop = 10;
      }
      if (finalLeft + menuWidth > window.innerWidth - 10) {
        finalLeft = window.innerWidth - menuWidth - 10;
      }
      menu.style.left = finalLeft + 'px';
      menu.style.top = finalTop + 'px';
      setTimeout(() => {
        searchInput.focus();
      }, 50);
      setTimeout(() => {
        const closeHandler = (ev) => {
          if (!menu.contains(ev.target)) {
            menu.remove();
            this.fontMenu = null;
            document.removeEventListener("mousedown", closeHandler);
          }
        };
        document.addEventListener("mousedown", closeHandler);
      }, 100);
    };

    nodeType.prototype.showHexEditor = function() {
      if (this.hexEditor) {
        this.hexEditor.remove();
        this.hexEditor = null;
      }
      const currentValue = this.textParams.text_color || '#FFFFFF';
      const pos = this.getNodeScreenCoords(this.hexRect.x, this.hexRect.y);
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;z-index:10002;background:#1a1a1a;border:1px solid #4CAF50;border-radius:4px;padding:6px 8px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:6px;';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentValue;
      input.style.cssText = 'width:80px;background:#222;color:#fff;border:1px solid #444;border-radius:3px;padding:4px 8px;font-size:11px;font-family:monospace;outline:none;text-transform:uppercase;';
      const okBtn = document.createElement('button');
      okBtn.textContent = 'OK';
      okBtn.style.cssText = 'background:#2196F3;color:#fff;border:none;border-radius:3px;padding:4px 10px;font-size:11px;cursor:pointer;';
      okBtn.onmouseover = () => okBtn.style.background = "#1976D2";
      okBtn.onmouseout = () => okBtn.style.background = "#2196F3";
      container.appendChild(input);
      container.appendChild(okBtn);
      document.body.appendChild(container);
      const containerHeight = container.offsetHeight;
      container.style.left = pos.x + 'px';
      container.style.top = (pos.y - containerHeight * 1.5) + 'px';
      this.hexEditor = container;
      const isValidHex = (val) => {
        const cleaned = val.replace('#', '');
        return /^([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cleaned);
      };
      const normalizeHex = (val) => {
        let cleaned = val.replace('#', '').toUpperCase();
        if (cleaned.length === 3) {
          cleaned = cleaned.split('').map(c => c + c).join('');
        }
        return '#' + cleaned;
      };
      input.addEventListener('input', (e) => {
        const val = e.target.value;
        if (isValidHex(val)) {
          input.style.borderColor = '#4CAF50';
          const normalized = normalizeHex(val);
          this.textParams.text_color = normalized;
          this.setDirtyCanvas(true);
        } else {
          input.style.borderColor = '#dc3545';
        }
      });
      const applyAndClose = () => {
        const val = input.value;
        if (isValidHex(val)) {
          this.textParams.text_color = normalizeHex(val);
          this.setDirtyCanvas(true);
        }
        container.remove();
        this.hexEditor = null;
      };
      okBtn.onclick = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        applyAndClose();
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          applyAndClose();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          container.remove();
          this.hexEditor = null;
        }
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (this.hexEditor === container) {
            applyAndClose();
          }
        }, 100);
      });
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    };

    nodeType.prototype.openColorPicker = function(clickEvent) {
      const currentColor = this.textParams.text_color || '#FFFFFF';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = currentColor;
      colorInput.style.display = 'none';
      document.body.appendChild(colorInput);
      colorInput.addEventListener('change', (e) => {
        const newColor = e.target.value.toUpperCase();
        this.textParams.text_color = newColor;
        this.setDirtyCanvas(true);
        if (this.scheduleRender) this.scheduleRender('text_color');
        this.syncAllWidgets();
        colorInput.remove();
      }, { once: true });
      setTimeout(() => {
        if (colorInput.showPicker) {
          colorInput.showPicker();
        } else {
          colorInput.click();
        }
      }, 10);
    };

    nodeType.prototype.updateLineSpacingFromMouse = function(localX) {
      if (!this.lineSpacingTrackRect) return;
      const { x: trackX, w: trackW } = this.lineSpacingTrackRect;
      let ratio = (localX - trackX) / trackW;
      ratio = Math.max(0, Math.min(1, ratio));
      const newValue = 0.5 + ratio * 2.5;
      this.textParams.line_spacing = Math.round(newValue * 20) / 20;
      this.setDirtyCanvas(true);
      if (this.scheduleRender) this.scheduleRender('line_spacing');
      this.syncAllWidgets();
    };

    nodeType.prototype.onResize = function(size) {
      if (size[0] < this.minWidth) size[0] = this.minWidth;
      const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
      const canvasTopPadding = 30;
      const cSize = Math.max(200, size[0] - 40);
      this.canvasPixelSize = cSize;
      const textareaH = 60;
      const alignH = 27;
      const fontColorH = 27;
      const btnH = 30;
      const gaps = 10 + 8 + 8 + 20 + 15;
      const neededHeight = titleH + canvasTopPadding + cSize + textareaH + alignH + fontColorH + btnH + gaps;
      if (size[1] < neededHeight) size[1] = neededHeight;
      this.setDirtyCanvas(true);
      if (this.isEditing && this.backgroundImage) {
        this.updateDisplaySize(cSize);
        this.updateOverlayAbsolute();
        this.computeAndApplyView();
      }
    };

    nodeType.prototype.getCanvasMetrics = function() {
      const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
      const canvasTopPadding = 30;
      let cSize, rectX, rectY;
      if (this.advancedMode) {
        const w = this.overlayCanvas.width || (this.overlayCanvasWrapper ? this.overlayCanvasWrapper.clientWidth : 1000);
        const h = this.overlayCanvas.height || (this.overlayCanvasWrapper ? this.overlayCanvasWrapper.clientHeight : 800);
        cSize = Math.min(w, h);
        rectX = 0; rectY = 0;
      } else {
        cSize = Math.max(200, this.size[0] - 40);
        rectX = (this.size[0] - cSize) / 2;
        rectY = titleH + canvasTopPadding;
      }
      return { cSize, rectX, rectY };
    };

    nodeType.prototype.drawAlignIcon = function(ctx, type, x, y, w, h, isActive) {
      const lineHeight = 2;
      const gap = 3;
      const totalH = lineHeight*3 + gap*2;
      const startY = y + (h - totalH)/2;
      ctx.fillStyle = isActive ? "#4CAF50" : "#aaa";
      if (type === "left") {
        ctx.fillRect(x, startY, w*0.9, lineHeight);
        ctx.fillRect(x, startY + lineHeight + gap, w*0.7, lineHeight);
        ctx.fillRect(x, startY + (lineHeight+gap)*2, w*0.5, lineHeight);
      } else if (type === "center") {
        const w1 = w*0.9, w2 = w*0.7, w3 = w*0.5;
        ctx.fillRect(x + (w-w1)/2, startY, w1, lineHeight);
        ctx.fillRect(x + (w-w2)/2, startY + lineHeight + gap, w2, lineHeight);
        ctx.fillRect(x + (w-w3)/2, startY + (lineHeight+gap)*2, w3, lineHeight);
      } else if (type === "right") {
        ctx.fillRect(x + w - w*0.9, startY, w*0.9, lineHeight);
        ctx.fillRect(x + w - w*0.7, startY + lineHeight + gap, w*0.7, lineHeight);
        ctx.fillRect(x + w - w*0.5, startY + (lineHeight+gap)*2, w*0.5, lineHeight);
      }
    };

    nodeType.prototype.drawLineSpacingIcon = function(ctx, x, y, w, h) {
      const lineY1 = y + h*0.3;
      const lineY2 = y + h*0.7;
      const arrowX = x + w/2;
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x+2, lineY1);
      ctx.lineTo(x+w-2, lineY1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x+2, lineY2);
      ctx.lineTo(x+w-2, lineY2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(arrowX, lineY1+2);
      ctx.lineTo(arrowX, lineY2-2);
      ctx.stroke();
      ctx.fillStyle = "#aaa";
      ctx.beginPath();
      ctx.moveTo(arrowX, lineY1+1);
      ctx.lineTo(arrowX-2, lineY1+4);
      ctx.lineTo(arrowX+2, lineY1+4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(arrowX, lineY2-1);
      ctx.lineTo(arrowX-2, lineY2-4);
      ctx.lineTo(arrowX+2, lineY2-4);
      ctx.fill();
    };

    nodeType.prototype.onDrawForeground = function(ctx) {
      if (this.advancedMode) {
        ctx.clearRect(0, 0, this.size[0], this.size[1]);
        return;
      }
      const { cSize, rectX, rectY } = this.getCanvasMetrics();
      ctx.fillStyle = "#1e1e1e"; ctx.fillRect(rectX, rectY, cSize, cSize);
      ctx.strokeStyle = "#555"; ctx.strokeRect(rectX, rectY, cSize, cSize);
      this.updateDisplaySize(cSize);
      if (this.isEditing && this.backgroundImage) {
        this.updateOverlayAbsolute();
        this.computeAndApplyView();
      }
      if (!this.dragState) { this.updateOverlayAbsolute(); this.computeAndApplyView(); }
      if (this.isLoading) {
        ctx.fillStyle = "#888"; ctx.font = "12px Arial"; ctx.fillText("Loading...", rectX + cSize/2 - 35, rectY + cSize/2);
      } else if (this.isEditing && this.backgroundImage) {
        const useScale = this.dragState ? this.dragState.viewScale : this.viewScale;
        const useOffsetX = this.dragState ? this.dragState.viewOffsetX : this.viewOffsetX;
        const useOffsetY = this.dragState ? this.dragState.viewOffsetY : this.viewOffsetY;
        ctx.save(); ctx.translate(rectX + useOffsetX, rectY + useOffsetY); ctx.scale(useScale, useScale);
        ctx.drawImage(this.backgroundImage, -this.displayWidth/2, -this.displayHeight/2, this.displayWidth, this.displayHeight);
        if (this.textMask) {
          ctx.save();
          ctx.translate(this.overlay.x, this.overlay.y);
          ctx.rotate(this.overlay.rotation * Math.PI / 180);
          const rectW = this.overlay.width;
          const rectH = this.overlay.height;
          this.drawTextOverlay(ctx, -rectW / 2, -rectH / 2, rectW, rectH);
          if (this.advancedMode) {
            ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4/useScale; ctx.strokeStyle = "#00FF00"; ctx.lineWidth = 1/useScale;
            ctx.strokeRect(-rectW/2, -rectH/2, rectW, rectH); ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
            const hw = rectW/2, hh = rectH/2, hs = 6/useScale; ctx.fillStyle = "#FF0000";
            [[hw, hh], [-hw, hh], [hw, -hh], [-hw, -hh]].forEach(([x, y]) => ctx.fillRect(x - hs/2, y - hs/2, hs, hs));
            [[hw, 0], [-hw, 0], [0, hh], [0, -hh]].forEach(([x, y]) => ctx.fillRect(x - hs/2, y - hs/2, hs, hs));
            const rotHandleY = -hh - 40; ctx.beginPath(); ctx.arc(0, rotHandleY, 7/useScale, 0, Math.PI*2); ctx.fillStyle = "#ff9800"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1/useScale; ctx.stroke();
          }
          ctx.restore();
        }
        ctx.restore();
        if (this.advancedMode) {
          ctx.fillStyle = "#ff9800"; ctx.font = "12px Arial"; ctx.fillText(`EDITING (Scale: ${(useScale*100).toFixed(0)}%)`, rectX + cSize - 160, rectY + cSize - 10);
        }
      } else {
        ctx.fillStyle = "#888"; ctx.font = "12px Arial"; ctx.fillText("▶ Run queue to start", rectX + cSize/2 - 65, rectY + cSize/2);
      }
      const toggleBtnW = 150, toggleBtnH = 24, toggleBtnX = (this.size[0] - toggleBtnW)/2, toggleBtnY = 20;
      ctx.fillStyle = "#2a2a2a"; ctx.strokeStyle = "#2196F3"; ctx.lineWidth = 2;
      this.roundRect(ctx, toggleBtnX, toggleBtnY, toggleBtnW, toggleBtnH, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#2196F3"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText("🔍 ADVANCED MODE", toggleBtnX + toggleBtnW/2, toggleBtnY + toggleBtnH/2 + 4);
      const widgetX = 15;
      const widgetW = this.size[0] - 30;
      const textareaY = rectY + cSize + 10;
      const textareaH = 60;
      this.textareaRect = { x: widgetX, y: textareaY, w: widgetW, h: textareaH };
      ctx.fillStyle = this.textareaHover ? "#2a2a2a" : "#252525";
      ctx.strokeStyle = this.textareaHover ? "#4CAF50" : "#444";
      ctx.lineWidth = 1;
      this.roundRect(ctx, widgetX, textareaY, widgetW, textareaH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(widgetX+1, textareaY+1, widgetW-2, textareaH-2);
      ctx.clip();
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const text = this.textParams.text || "";
      const lines = text.split('\n');
      const maxLines = 3;
      const lineHeight = 16;
      const paddingX = 8;
      const paddingY = 6;
      if (!text) {
        ctx.fillStyle = "#666";
        ctx.fillText("Your text…", widgetX+paddingX, textareaY+paddingY);
      } else {
        for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
          let line = lines[i];
          const maxWidth = widgetW - paddingX*2;
          while (ctx.measureText(line).width > maxWidth && line.length > 0) {
            line = line.slice(0, -1);
          }
          if (line !== lines[i]) line += "…";
          ctx.fillStyle = "#aaa";
          ctx.fillText(line, widgetX+paddingX, textareaY+paddingY+i*lineHeight);
        }
        if (lines.length > maxLines) {
          ctx.fillStyle = "#666";
          ctx.fillText("…", widgetX+paddingX, textareaY+paddingY+maxLines*lineHeight);
        }
      }
      ctx.restore();
      const alignY = textareaY + textareaH + 8;
      const alignH = 27;
      const padding = 5;
      const availableW = widgetW - padding*2;
      const sliderW = availableW * 0.7;
      const sliderX = widgetX + padding;
      this.lineSpacingRect = { x: sliderX, y: alignY, w: sliderW, h: alignH };
      const btnW = availableW * 0.1;
      const btnGap = 4;
      const btnStartX = sliderX + sliderW + btnGap;
      const alignTypes = ["left", "center", "right"];
      this.alignButtonsRects = [];
      const isMultiline = text.includes('\n');
      ctx.fillStyle = this.lineSpacingHover ? "#2a2a2a" : "#252525";
      ctx.strokeStyle = this.lineSpacingHover ? "#4CAF50" : "#444";
      ctx.lineWidth = 1;
      this.roundRect(ctx, sliderX, alignY, sliderW, alignH, 4);
      ctx.fill();
      ctx.stroke();
      this.drawLineSpacingIcon(ctx, sliderX+6, alignY+6, 14, 15);
      const trackX = sliderX + 24;
      const trackW = sliderW - 70;
      const trackY = alignY + alignH/2;
      const trackH = 3;
      this.lineSpacingTrackRect = { x: trackX, y: alignY, w: trackW, h: alignH };
      ctx.fillStyle = "#444";
      ctx.fillRect(trackX, trackY - trackH/2, trackW, trackH);
      const lineSpacingVal = parseFloat(this.textParams.line_spacing) || 1.0;
      const fillRatio = Math.max(0, Math.min(1, (lineSpacingVal - 0.5)/2.5));
      const fillW = trackW * fillRatio;
      ctx.fillStyle = "#4CAF50";
      ctx.fillRect(trackX, trackY - trackH/2, fillW, trackH);
      const handleX = trackX + fillW;
      const handleSize = 8;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(handleX, trackY, handleSize/2, 0, Math.PI*2);
      ctx.fill();
      const valueW = 42;
      const valueX = sliderX + sliderW - valueW - 4;
      this.lineSpacingValueRect = { x: valueX, y: alignY, w: valueW, h: alignH };
      ctx.fillStyle = this.lineSpacingValueHover ? "#2a2a2a" : "#222";
      ctx.strokeStyle = this.lineSpacingValueHover ? "#4CAF50" : "#444";
      ctx.lineWidth = 1;
      this.roundRect(ctx, valueX, alignY+3, valueW, alignH-6, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#4CAF50";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(lineSpacingVal.toFixed(2), valueX+valueW/2, alignY+alignH/2+3);
      for (let i = 0; i < 3; i++) {
        const bx = btnStartX + i*(btnW+btnGap);
        const isActive = this.textParams.text_align === alignTypes[i];
        const isHover = this.alignButtonsHover[i];
        const isEnabled = isMultiline;
        this.alignButtonsRects.push({ x: bx, y: alignY, w: btnW, h: alignH, type: alignTypes[i], enabled: isEnabled });
        ctx.fillStyle = isHover && isEnabled ? "#2a2a2a" : "#252525";
        ctx.strokeStyle = isActive && isEnabled ? "#4CAF50" : (isHover && isEnabled ? "#4CAF50" : "#444");
        ctx.lineWidth = isActive && isEnabled ? 2 : 1;
        ctx.globalAlpha = isEnabled ? 1.0 : 0.4;
        this.roundRect(ctx, bx, alignY, btnW, alignH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        if (isEnabled) {
          this.drawAlignIcon(ctx, alignTypes[i], bx + (btnW-14)/2, alignY + (alignH-10)/2, 14, 10, isActive);
        }
      }
      const fontColorY = alignY + alignH + 8;
      const fontColorH = 27;
      const gap = 8;
      const fontSelectW = Math.floor((widgetW - gap) * 0.6);
      const colorPickerW = widgetW - fontSelectW - gap;
      const fontSelectX = widgetX;
      const colorPickerX = widgetX + fontSelectW + gap;
      this.fontColorY = fontColorY;
      this.fontSelectRect = { x: fontSelectX, y: fontColorY, w: fontSelectW, h: fontColorH };
      ctx.fillStyle = this.fontSelectHover ? "#2a2a2a" : "#252525";
      ctx.strokeStyle = this.fontSelectHover ? "#4CAF50" : "#444";
      ctx.lineWidth = 1;
      this.roundRect(ctx, fontSelectX, fontColorY, fontSelectW, fontColorH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      const fontName = this.textParams.font_name || "Fonts not found";
      ctx.fillText(fontName, fontSelectX+fontSelectW/2, fontColorY+fontColorH/2+4);
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.moveTo(fontSelectX+fontSelectW-12, fontColorY+fontColorH/2-3);
      ctx.lineTo(fontSelectX+fontSelectW-6, fontColorY+fontColorH/2-3);
      ctx.lineTo(fontSelectX+fontSelectW-9, fontColorY+fontColorH/2+3);
      ctx.fill();
      const colorBoxSize = 24;
      const colorBoxY = fontColorY + Math.round((fontColorH - colorBoxSize)/2);
      const hexW = colorPickerW - colorBoxSize - 5;
      const hexX = colorPickerX;
      const colorBoxX = colorPickerX + hexW + 5;
      this.hexRect = { x: hexX, y: fontColorY, w: hexW, h: fontColorH };
      this.colorBoxRect = { x: colorBoxX, y: colorBoxY, w: colorBoxSize, h: colorBoxSize };
      ctx.fillStyle = this.hexHover ? "#2a2a2a" : "#252525";
      ctx.fillRect(hexX, fontColorY, hexW, fontColorH);
      ctx.strokeStyle = this.hexHover ? "#4CAF50" : "#444";
      ctx.lineWidth = 1;
      ctx.strokeRect(hexX, fontColorY, hexW, fontColorH);
      ctx.fillStyle = "#fff";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.textParams.text_color || "#FFFFFF", hexX+hexW/2, fontColorY+fontColorH/2+4);
      ctx.fillStyle = this.textParams.text_color || "#FFFFFF";
      this.roundRect(ctx, colorBoxX, colorBoxY, colorBoxSize, colorBoxSize, 4);
      ctx.fill();
      ctx.strokeStyle = this.colorBoxHover ? "#4CAF50" : "#fff";
      ctx.lineWidth = 1.5;
      this.roundRect(ctx, colorBoxX, colorBoxY, colorBoxSize, colorBoxSize, 4);
      ctx.stroke();
      const buttonsY = fontColorY + fontColorH + 20;
      this.buttonsY = buttonsY;
      const btnH = 30;
      const btnGap2 = 10;
      const btnW2 = (this.size[0] - 35) / 2;
      [[15, buttonsY, "✔️ APPLY", this.btnApplyHover, "#4CAF50"], [15+btnW2+btnGap2, buttonsY, " CANCEL", this.btnCancelHover, "#dc3545"]].forEach(([bx, by, txt, hov, col]) => {
        ctx.fillStyle = hov ? "#444" : "#2a2a2a";
        this.roundRect(ctx, bx, by, btnW2, btnH, 6);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.font = "bold 11px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(txt, bx+btnW2/2, by+btnH/2+4);
      });
    };

    nodeType.prototype.onMouseDown = function(event, pos) {
      if (!this.advancedMode && pos) {
        const toggleBtnW = 150, toggleBtnH = 24, toggleBtnX = (this.size[0] - toggleBtnW)/2, toggleBtnY = 20;
        if (pos[0] >= toggleBtnX && pos[0] <= toggleBtnX + toggleBtnW && pos[1] >= toggleBtnY && pos[1] <= toggleBtnY + toggleBtnH) {
          this._toggleAdvancedMode();
          return true;
        }
      }
      if (this.textareaRect) {
        const { x, y, w, h } = this.textareaRect;
        if (pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h) {
          const canvas = LGraphCanvas.active_canvas;
          if (canvas) {
            const rect = canvas.canvas.getBoundingClientRect();
            const ds = canvas.ds;
            this.lastClickCoords = {
              clientX: rect.left + (this.pos[0] + pos[0]) * ds.scale + ds.offset[0],
              clientY: rect.top + (this.pos[1] + pos[1]) * ds.scale + ds.offset[1]
            };
          }
          this.openTextarea(this.lastClickCoords);
          return true;
        }
      }
      if (this.lineSpacingValueRect) {
        const { x, y, w, h } = this.lineSpacingValueRect;
        if (pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h) {
          if (this.lineSpacingPopup) {
            this.lineSpacingPopup.remove();
            this.lineSpacingPopup = null;
          }
          const currentValue = this.textParams.line_spacing;
          const popup = document.createElement('div');
          popup.style.cssText = 'position:fixed;z-index:10003;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:8px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;';
          const input = document.createElement('input');
          input.type = 'number';
          input.value = currentValue;
          input.min = 0.5;
          input.max = 3.0;
          input.step = 0.05;
          input.style.cssText = 'width:100px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:12px;outline:none;';
          const saveBtn = document.createElement('button');
          saveBtn.textContent = 'OK';
          saveBtn.style.cssText = 'background:#2196F3;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;';
          const doSave = () => {
            let num = parseFloat(input.value);
            if (isNaN(num)) num = currentValue;
            num = Math.max(0.5, Math.min(3.0, num));
            this.textParams.line_spacing = num;
            popup.remove();
            this.lineSpacingPopup = null;
            if (this.scheduleRender) this.scheduleRender('line_spacing');
            this.syncAllWidgets();
          };
          saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); doSave(); };
          input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doSave(); } };
          popup.appendChild(input);
          popup.appendChild(saveBtn);
          document.body.appendChild(popup);
          const screenPos = this.getNodeScreenCoords(x, y);
          const popupWidth = popup.offsetWidth;
          const popupHeight = popup.offsetHeight;
          let leftPos = screenPos.x;
          let topPos = screenPos.y - popupHeight - 8;
          if (topPos < 8) topPos = screenPos.y + 8;
          if (leftPos + popupWidth > window.innerWidth - 8) leftPos = window.innerWidth - popupWidth - 8;
          popup.style.left = leftPos + 'px';
          popup.style.top = topPos + 'px';
          this.lineSpacingPopup = popup;
          setTimeout(() => { input.focus(); input.select(); }, 50);
          setTimeout(() => {
            const closeHandler = (ev) => {
              if (!popup.contains(ev.target)) {
                popup.remove();
                this.lineSpacingPopup = null;
                document.removeEventListener('mousedown', closeHandler);
              }
            };
            document.addEventListener('mousedown', closeHandler);
          }, 100);
          return true;
        }
      }
      if (this.lineSpacingTrackRect) {
        const { x, y, w, h } = this.lineSpacingTrackRect;
        if (pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h) {
          this.lineSpacingDragging = true;
          this.updateLineSpacingFromMouse(pos[0]);
          return true;
        }
      }
      if (this.alignButtonsRects && this.alignButtonsRects.length === 3) {
        for (let i = 0; i < 3; i++) {
          const { x, y, w, h, type, enabled } = this.alignButtonsRects[i];
          if (enabled && pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h) {
            this.textParams.text_align = type;
            this.setDirtyCanvas(true);
            if (this.scheduleRender) this.scheduleRender('text_align');
            this.syncAllWidgets();
            return true;
          }
        }
      }
      if (this.fontSelectRect) {
        const { x, y, w, h } = this.fontSelectRect;
        if (pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h) {
          this.showFontSelector();
          return true;
        }
      }
      if (this.hexRect) {
        const { x, y, w, h } = this.hexRect;
        if (pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h) {
          this.showHexEditor();
          return true;
        }
      }
      if (this.colorBoxRect) {
        const { x, y, w, h } = this.colorBoxRect;
        if (pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h) {
          this.openColorPicker();
          return true;
        }
      }
      if (pos && this.buttonsY !== undefined) {
        const btnH = 30;
        const btnGap = 10;
        const btnW = (this.size[0] - 35) / 2;
        const y1 = this.buttonsY;
        if (pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH) {
          this.sendTransforms();
          return true;
        }
        if (pos[0] >= 15 + btnW + btnGap && pos[0] <= 15 + btnW + btnGap + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH) {
          this.cancelEditing();
          return true;
        }
      }

      if (!this.advancedMode) return false;

      if (!this.isEditing || this.isLoading || !this.textMask) return;
      const { cSize, rectX, rectY } = this.getCanvasMetrics();
      const mx = pos[0], my = pos[1];
      const frozenScale = this.viewScale, frozenOffsetX = this.viewOffsetX, frozenOffsetY = this.viewOffsetY;
      const worldMx = (mx - rectX - frozenOffsetX) / frozenScale, worldMy = (my - rectY - frozenOffsetY) / frozenScale;
      const screenHandles = this.computeScreenHandles(rectX, rectY, frozenScale, frozenOffsetX, frozenOffsetY);
      const cornerSize = 14, edgeSize = 18, rotateSize = 26;
      let detectedType = null, minDist = Infinity;
      const checkHandle = (name, h, threshold) => {
        const dist = Math.hypot(mx - h.x, my - h.y);
        if (dist < threshold && dist < minDist) {
          detectedType = name;
          minDist = dist;
        }
      };
      for (const [name, hPos] of Object.entries(screenHandles)) {
        const isEdge = ['scale-t', 'scale-b', 'scale-l', 'scale-r'].includes(name);
        const threshold = name === 'rotate' ? rotateSize : (isEdge ? edgeSize : cornerSize);
        checkHandle(name, hPos, threshold);
      }
      this.dragType = detectedType;
      if (this.dragType) {
        this.isDragging = true;
        this.awaitingServerRender = false;
        const startW = this.overlay.width;
        const startH = this.overlay.height;
        const startRot = this.overlay.rotation * Math.PI / 180;
        const startCX = this.overlay.x;
        const startCY = this.overlay.y;
        const localPoints = {
          'scale-br': { active: [startW/2, startH/2], fixed: [-startW/2, -startH/2] },
          'scale-bl': { active: [-startW/2, startH/2], fixed: [startW/2, -startH/2] },
          'scale-tr': { active: [startW/2, -startH/2], fixed: [-startW/2, startH/2] },
          'scale-tl': { active: [-startW/2, -startH/2], fixed: [startW/2, startH/2] },
          'scale-r': { active: [startW/2, 0], fixed: [-startW/2, 0] },
          'scale-l': { active: [-startW/2, 0], fixed: [startW/2, 0] },
          'scale-b': { active: [0, startH/2], fixed: [0, -startH/2] },
          'scale-t': { active: [0, -startH/2], fixed: [0, startH/2] }
        };
        const pts = localPoints[this.dragType];
        const fixedLocal = pts ? { x: pts.fixed[0], y: pts.fixed[1] } : { x: 0, y: 0 };
        const activeLocal = pts ? { x: pts.active[0], y: pts.active[1] } : { x: 0, y: 0 };
        this.dragState = {
          startMouseX: worldMx, startMouseY: worldMy,
          startX: this.overlay.x, startY: this.overlay.y,
          startW: startW, startH: startH,
          startRotation: this.overlay.rotation,
          startRot: startRot,
          startCX: startCX,
          startCY: startCY,
          viewScale: frozenScale, viewOffsetX: frozenOffsetX, viewOffsetY: frozenOffsetY,
          fixedLocal: fixedLocal,
          activeLocal: activeLocal
        };
        return true;
      }
      const halfW = this.overlay.width / 2;
      const halfH = this.overlay.height / 2;
      const dx = worldMx - this.overlay.x, dy = worldMy - this.overlay.y;
      const rotRad = -this.overlay.rotation * Math.PI / 180;
      const localX = dx * Math.cos(rotRad) - dy * Math.sin(rotRad), localY = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
      if (Math.abs(localX) < halfW && Math.abs(localY) < halfH) {
        this.dragType = 'move';
        this.dragState = { startMouseX: worldMx, startMouseY: worldMy, startX: this.overlay.x, startY: this.overlay.y, startW: this.overlay.width, startH: this.overlay.height, startRotation: this.overlay.rotation, startRot: this.overlay.rotation * Math.PI / 180, viewScale: frozenScale, viewOffsetX: frozenOffsetX, viewOffsetY: frozenOffsetY };
        return true;
      }
      return false;
    };

    nodeType.prototype.onMouseMove = function(event, pos) {
      if (this.lineSpacingDragging && pos) {
        this.updateLineSpacingFromMouse(pos[0]);
        return;
      }
      const prevTextareaHover = this.textareaHover;
      if (this.textareaRect && !this.textareaState.isOpen) {
        const { x, y, w, h } = this.textareaRect;
        this.textareaHover = pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h;
      } else {
        this.textareaHover = false;
      }
      if (prevTextareaHover !== this.textareaHover) this.setDirtyCanvas(true);
      const prevLineSpacingHover = this.lineSpacingHover;
      if (this.lineSpacingRect) {
        const { x, y, w, h } = this.lineSpacingRect;
        this.lineSpacingHover = pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h;
      } else {
        this.lineSpacingHover = false;
      }
      if (prevLineSpacingHover !== this.lineSpacingHover) this.setDirtyCanvas(true);
      const prevLineSpacingValueHover = this.lineSpacingValueHover || false;
      if (this.lineSpacingValueRect) {
        const { x, y, w, h } = this.lineSpacingValueRect;
        this.lineSpacingValueHover = pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h;
      } else {
        this.lineSpacingValueHover = false;
      }
      if (prevLineSpacingValueHover !== this.lineSpacingValueHover) this.setDirtyCanvas(true);
      const prevAlignHover = [...this.alignButtonsHover];
      if (this.alignButtonsRects && this.alignButtonsRects.length === 3) {
        for (let i = 0; i < 3; i++) {
          const { x, y, w, h, enabled } = this.alignButtonsRects[i];
          this.alignButtonsHover[i] = enabled && pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h;
        }
      } else {
        this.alignButtonsHover = [false, false, false];
      }
      if (prevAlignHover.some((v, i) => v !== this.alignButtonsHover[i])) this.setDirtyCanvas(true);
      const prevFontHover = this.fontSelectHover;
      if (this.fontSelectRect) {
        const { x, y, w, h } = this.fontSelectRect;
        this.fontSelectHover = pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h;
      } else {
        this.fontSelectHover = false;
      }
      if (prevFontHover !== this.fontSelectHover) this.setDirtyCanvas(true);
      const prevHexHover = this.hexHover;
      if (this.hexRect) {
        const { x, y, w, h } = this.hexRect;
        this.hexHover = pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h;
      } else {
        this.hexHover = false;
      }
      if (prevHexHover !== this.hexHover) this.setDirtyCanvas(true);
      const prevColorBoxHover = this.colorBoxHover;
      if (this.colorBoxRect) {
        const { x, y, w, h } = this.colorBoxRect;
        this.colorBoxHover = pos[0] >= x && pos[0] <= x + w && pos[1] >= y && pos[1] <= y + h;
      } else {
        this.colorBoxHover = false;
      }
      if (prevColorBoxHover !== this.colorBoxHover) this.setDirtyCanvas(true);
      const prevBtnApply = this.btnApplyHover;
      const prevBtnCancel = this.btnCancelHover;
      if (this.buttonsY !== undefined) {
        const btnH = 30;
        const btnGap = 10;
        const btnW = (this.size[0] - 35) / 2;
        const y1 = this.buttonsY;
        this.btnApplyHover = pos[0] >= 15 && pos[0] <= 15 + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH;
        this.btnCancelHover = pos[0] >= 15 + btnW + btnGap && pos[0] <= 15 + btnW + btnGap + btnW && pos[1] >= y1 && pos[1] <= y1 + btnH;
      }
      if (prevBtnApply !== this.btnApplyHover || prevBtnCancel !== this.btnCancelHover) this.setDirtyCanvas(true);

      if (!this.advancedMode) return;

      if (!this.dragType || !this.isEditing || this.isLoading || !this.dragState) return;
      const { rectX, rectY } = this.getCanvasMetrics();
      const mx = pos[0], my = pos[1];
      const worldMx = (mx - rectX - this.dragState.viewOffsetX) / this.dragState.viewScale;
      const worldMy = (my - rectY - this.dragState.viewOffsetY) / this.dragState.viewScale;
      if (this.dragType === 'move') {
        this.overlay.x = this.dragState.startX + (worldMx - this.dragState.startMouseX);
        this.overlay.y = this.dragState.startY + (worldMy - this.dragState.startMouseY);
      }
      else if (this.dragType === 'rotate') {
        const cx = this.overlay.x, cy = this.overlay.y;
        const sA = Math.atan2(this.dragState.startMouseY - cy, this.dragState.startMouseX - cx);
        const cA = Math.atan2(worldMy - cy, worldMx - cx);
        this.overlay.rotation = this.dragState.startRotation + (cA - sA) * 180 / Math.PI;
      }
      else if (this.dragType.startsWith('scale')) {
        const { startCX, startCY, startW, startH, startRot, fixedLocal, activeLocal } = this.dragState;
        const { x: fx, y: fy } = fixedLocal;
        const { x: ax0, y: ay0 } = activeLocal;
        const cosR = Math.cos(startRot), sinR = Math.sin(startRot);
        const fixedWorldX = startCX + fx*cosR - fy*sinR;
        const fixedWorldY = startCY + fx*sinR + fy*cosR;
        const dxw = worldMx - fixedWorldX;
        const dyw = worldMy - fixedWorldY;
        const ldx = dxw*cosR + dyw*sinR;
        const ldy = -dxw*sinR + dyw*cosR;
        let newW = startW, newH = startH;
        const isCorner = (ax0 !== 0 && ay0 !== 0);
        if (ax0 !== 0) {
          const signX = Math.sign(ax0);
          newW = 2 * (ldx + fx) / signX;
          newW = Math.max(40, newW);
        }
        if (ay0 !== 0) {
          const signY = Math.sign(ay0);
          newH = 2 * (ldy + fy) / signY;
          newH = Math.max(40, newH);
        }
        if (isCorner) {
          const scaleX = newW / startW;
          const scaleY = newH / startH;
          const scale = Math.max(scaleX, scaleY);
          newW = startW * scale;
          newH = startH * scale;
        }
        const newCX = fixedWorldX - (fx*cosR - fy*sinR);
        const newCY = fixedWorldY - (fx*sinR + fy*cosR);
        this.overlay.x = newCX;
        this.overlay.y = newCY;
        this.overlay.width = newW;
        this.overlay.height = newH;
        this.textParams.text_scale_x = this.overlay.width / this.baseWidth;
        this.textParams.text_scale_y = this.overlay.height / this.baseHeight;
      }
      this.setDirtyCanvas(true);
    };

    nodeType.prototype.onMouseUp = function() {
      if (this.lineSpacingDragging) {
        this.lineSpacingDragging = false;
        this.setDirtyCanvas(true);
      }
      if (!this.advancedMode) {
        this.dragType = null;
        this.dragState = null;
        this.setDirtyCanvas(true);
        return;
      }
      if (this.dragType) {
        const wasScale = this.dragType.startsWith('scale');
        const wasRotate = this.dragType === 'rotate';
        if (wasScale) {
          this.awaitingServerRender = true;
        }
        this.updateRelativeFromAbsolute();
        if (!this.advancedMode) {
          this.computeAndApplyView();
        }
        if (wasScale || wasRotate) {
          if (this.currentRenderAbortController) {
            this.currentRenderAbortController.abort();
            this.currentRenderAbortController = null;
          }
          if (this.renderTimeout) clearTimeout(this.renderTimeout);
          this.currentRenderAbortController = new AbortController();
          const signal = this.currentRenderAbortController.signal;
          this.renderMasks(signal);
        }
      }
      this.isDragging = false;
      this.dragType = null;
      this.dragState = null;
    };
  }
});