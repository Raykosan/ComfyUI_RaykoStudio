import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

let activeNodeId = null;

const BASIC_PARAMS = ['brightness', 'contrast', 'hue', 'saturation'];

const DEFAULT_SLIDER_VALUES = {
  brightness: 0,
  contrast: 0,
  hue: 0,
  saturation: 0,
  lut_intensity: 100,
  input_black: 0,
  gamma: 1.0,
  input_white: 255,
  exposure: 0,
  offset: 0,
  shadows_cyan_red: 0,
  shadows_magenta_green: 0,
  shadows_yellow_blue: 0,
  midtones_cyan_red: 0,
  midtones_magenta_green: 0,
  midtones_yellow_blue: 0,
  highlights_cyan_red: 0,
  highlights_magenta_green: 0,
  highlights_yellow_blue: 0,
  bw_red: 40,
  bw_yellow: 60,
  bw_green: 40,
  bw_cyan: 60,
  bw_blue: 20,
  bw_magenta: 80,
  red_red: 100,
  red_green: 0,
  red_blue: 0,
  green_red: 0,
  green_green: 100,
  green_blue: 0,
  blue_red: 0,
  blue_green: 0,
  blue_blue: 100,
  selective_cyan: 0,
  selective_magenta: 0,
  selective_yellow: 0,
  selective_black: 0,
  sc_cyan: 0,
  sc_magenta: 0,
  sc_yellow: 0,
  sc_black: 0,
  bw_enabled: false,
};

const DEFAULT_ADJUSTMENTS = {
  brightness: 0,
  contrast: 0,
  hue: 0,
  saturation: 0,
  lut_path: "",
  lut_intensity: 100,
  levels: { input_black: 0, gamma: 1.0, input_white: 255 },
  exposure: { exposure: 0, offset: 0 },
  color_balance: {
    shadows_cyan_red: 0, shadows_magenta_green: 0, shadows_yellow_blue: 0,
    midtones_cyan_red: 0, midtones_magenta_green: 0, midtones_yellow_blue: 0,
    highlights_cyan_red: 0, highlights_magenta_green: 0, highlights_yellow_blue: 0
  },
  black_white: { bw_red: 40, bw_yellow: 60, bw_green: 40, bw_cyan: 60, bw_blue: 20, bw_magenta: 80 },
  bw_enabled: false,
  channel_mixer: {
    red_red: 100, red_green: 0, red_blue: 0,
    green_red: 0, green_green: 100, green_blue: 0,
    blue_red: 0, blue_green: 0, blue_blue: 100
  },
  selective_color: { color_name: "Reds", sc_cyan: 0, sc_magenta: 0, sc_yellow: 0, sc_black: 0 }
};

function applyBasicAdjustmentsJS(imageData, brightness, contrast, hue, saturation) {
  const data = imageData.data;
  const len = data.length;
  
  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (brightness !== 0 || contrast !== 0) {
      const alpha = 1.0 + (contrast / 100.0);
      const beta = brightness;
      r = Math.min(255, Math.max(0, r * alpha + beta));
      g = Math.min(255, Math.max(0, g * alpha + beta));
      b = Math.min(255, Math.max(0, b * alpha + beta));
    }

    if (hue !== 0 || saturation !== 0) {
      const rNorm = r / 255.0;
      const gNorm = g / 255.0;
      const bNorm = b / 255.0;
      const max = Math.max(rNorm, gNorm, bNorm);
      const min = Math.min(rNorm, gNorm, bNorm);
      const delta = max - min;
      let h = 0, s = 0, v = max;
      
      if (delta !== 0) {
        s = delta / max;
        if (max === rNorm) h = ((gNorm - bNorm) / delta) % 6;
        else if (max === gNorm) h = (bNorm - rNorm) / delta + 2;
        else h = (rNorm - gNorm) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
      }
      
      h = Math.floor(h);
      s = Math.floor(s * 255);
      v = Math.floor(v * 255);
      h = Math.floor(h / 2);
      
      h = (h + hue) % 180;
      if (h < 0) h += 180;
      s = Math.min(255, Math.max(0, Math.floor(s * (1.0 + saturation / 100.0))));
      
      h = h * 2;
      s = s / 255;
      v = v / 255;
      
      const c = v * s;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = v - c;
      
      let r2 = 0, g2 = 0, b2 = 0;
      if (h < 60) { r2 = c; g2 = x; b2 = 0; }
      else if (h < 120) { r2 = x; g2 = c; b2 = 0; }
      else if (h < 180) { r2 = 0; g2 = c; b2 = x; }
      else if (h < 240) { r2 = 0; g2 = x; b2 = c; }
      else if (h < 300) { r2 = x; g2 = 0; b2 = c; }
      else { r2 = c; g2 = 0; b2 = x; }
      
      r = Math.floor((r2 + m) * 255);
      g = Math.floor((g2 + m) * 255);
      b = Math.floor((b2 + m) * 255);
    }

    data[i] = Math.min(255, Math.max(0, Math.floor(r)));
    data[i + 1] = Math.min(255, Math.max(0, Math.floor(g)));
    data[i + 2] = Math.min(255, Math.max(0, Math.floor(b)));
  }
  return imageData;
}

app.registerExtension({
  name: "RaykoStudio.RSImageAdjustments",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "RS_ImageAdjustments") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      if (onNodeCreated) onNodeCreated.apply(this, arguments);

      this.adjustments = JSON.parse(JSON.stringify(DEFAULT_ADJUSTMENTS));
      this.backgroundImage = null;
      this.previewImage = null;
      this.originalImageData = null;
      this._tempCanvas = document.createElement('canvas');
      this._tempCtx = this._tempCanvas.getContext('2d');
      this.isEditing = false;
      this.isLoading = false;
      this.advancedMode = false;
      this.currentSessionTimestamp = null;
      this.pendingEditorData = null;
      this.renderTimeout = null;
      this.currentRenderAbortController = null;
      this._previewTimestamp = null;
      this._previewKey = null;
      this._overlayRenderLoop = null;
      this._ws = null;
      this._wsConnected = false;
      this._wsReconnectTimer = null;
      this._lastHeavyRenderTime = 0;
      this._isHeavyRenderPending = false;

      this.displayWidth = 420;
      this.displayHeight = 420;
      this.canvasPixelSize = 420;
      this.realBackground = { width: 0, height: 0 };

      this.overlayContainer = null;
      this.overlayCanvas = null;
      this.overlayCtx = null;
      this.overlayCanvasWrapper = null;
      this.sidePanel = null;
      this.overlayInputs = {};
      this.sliderDisplays = {};

      this.minWidth = 500;
      this.minHeight = 450;
      this.setSize([this.minWidth, this.minHeight]);

      this.slidersY = 0;
      this.sliderRects = [];
      this.resetBtnRects = [];
      this.sliderHover = [false, false, false, false];
      this.resetBtnHover = [false, false, false, false];
      this.sliderDragging = -1;

      this.btnApplyHover = false;
      this.btnCancelHover = false;
      this.btnAdvancedHover = false;
      this.btnResetAllHover = false;
      this._allSectionsExpanded = false;
      this._basicParamLabels = {};

      this._syncingWidgets = false;

      const syncWidgetValue = (widgetName, value) => {
        const widget = this.widgets?.find(w => w.name === widgetName);
        if (widget) {
          widget.value = value;
        }
      };

      ["brightness", "contrast", "hue", "saturation"].forEach(n => {
        const w = this.widgets?.find(w => w.name === n);
        if (w) {
          w.hidden = true;
          w.computeSize = () => [0, 0];
          w.y = 0;
          const origCallback = w.callback;
          w.callback = (v) => {
            if (origCallback) origCallback.apply(w, arguments);
            if (!this._syncingWidgets) {
              this.adjustments[n] = v;
              this.previewImage = null;
              this.setDirtyCanvas(true);
            }
          };
        }
      });

      const advWidget = this.widgets?.find(w => w.name === "advanced_params");
      if (advWidget) {
        advWidget.hidden = true;
        advWidget.computeSize = () => [0, 0];
        advWidget.y = 0;
      }

      this._hideNativeWidgets();
      this._buildOverlayUI();

      this._mouseLeaveHandler = () => {
        if (this.sliderDragging >= 0) {
          this.sliderDragging = -1;
          this.setDirtyCanvas(true);
        }
      };

      const originalOnMouseLeave = this.onMouseLeave;
      this.onMouseLeave = function() {
        if (originalOnMouseLeave) originalOnMouseLeave.apply(this, arguments);
        this._mouseLeaveHandler();
      };

      api.addEventListener("rs-adjustments-start", (event) => {
        if (event.detail.id != this.id) return;
        this.pendingEditorData = event.detail;
        this._openDeferredEditor();
      });

      api.addEventListener("interrupted", () => {
        this._cleanup();
      });
    };

    nodeType.prototype._hideNativeWidgets = function() {
      if (!this.widgets) return;
      BASIC_PARAMS.forEach(param => {
        const widget = this.widgets.find(w => w.name === param);
        if (widget) {
          widget.hidden = true;
          widget.computeSize = () => [0, 0];
          widget.y = 0;
        }
      });
      this.setSize([this.minWidth, this.minHeight]);
      this.setDirtyCanvas(true);
    };

    nodeType.prototype._syncWidgetsFromAdjustments = function() {
      if (!this.widgets) return;
      this._syncingWidgets = true;
      try {
        BASIC_PARAMS.forEach(param => {
          const widget = this.widgets.find(w => w.name === param);
          if (widget && widget.value !== this.adjustments[param]) {
            widget.value = this.adjustments[param];
          }
        });
      } finally {
        this._syncingWidgets = false;
      }
      this.setDirtyCanvas(true);
    };

    nodeType.prototype._syncOverlayUI = function() {
      if (!this.advancedMode) return;
      BASIC_PARAMS.forEach(key => {
        if (this.overlayInputs[key]) {
          this.overlayInputs[key].value = this.adjustments[key];
        }
        if (this.sliderDisplays[key]) {
          this.sliderDisplays[key].textContent = String(this.adjustments[key]);
        }
      });
    };

    nodeType.prototype._isParamModified = function(key, parentObj = this.adjustments) {
      const def = DEFAULT_SLIDER_VALUES[key];
      if (def === undefined) {
        return false;
      }
  
      const val = parentObj[key];
      if (val === undefined) {
        return false;
      }
  
      if (typeof def === 'number') {
        const isModified = Math.abs(val - def) > 0.001;
        return isModified;
      }
      return val !== def;
    };

    nodeType.prototype._isSectionModified = function(sectionName) {
      const checks = {
        lut: () => (this.adjustments.lut_path && this.adjustments.lut_path !== "") || this._isParamModified('lut_intensity'),
    
        levels: () => this._isParamModified('input_black', this.adjustments.levels) || 
                      this._isParamModified('gamma', this.adjustments.levels) || 
                      this._isParamModified('input_white', this.adjustments.levels),
                  
        exposure: () => this._isParamModified('exposure', this.adjustments.exposure) || 
                        this._isParamModified('offset', this.adjustments.exposure),
                    
        color_balance: () => [
          'shadows_cyan_red', 'shadows_magenta_green', 'shadows_yellow_blue',
          'midtones_cyan_red', 'midtones_magenta_green', 'midtones_yellow_blue',
          'highlights_cyan_red', 'highlights_magenta_green', 'highlights_yellow_blue'
        ].some(k => this._isParamModified(k, this.adjustments.color_balance)),
    
        black_white: () => ['bw_red', 'bw_yellow', 'bw_green', 'bw_cyan', 'bw_blue', 'bw_magenta'].some(k => this._isParamModified(k, this.adjustments.black_white)),
    
        channel_mixer: () => [
          'red_red', 'red_green', 'red_blue',
          'green_red', 'green_green', 'green_blue',
          'blue_red', 'blue_green', 'blue_blue'
        ].some(k => this._isParamModified(k, this.adjustments.channel_mixer)),
    
        selective_color: () => ['sc_cyan', 'sc_magenta', 'sc_yellow', 'sc_black'].some(k => this._isParamModified(k, this.adjustments.selective_color))
      };
  
      return checks[sectionName] ? checks[sectionName]() : false;
    };

    nodeType.prototype._updateSectionHeaders = function() {
      if (!this._sectionRegistry) {
        return;
      }
  
      this._sectionRegistry.forEach(entry => {
        const modified = this._isSectionModified(entry.name);
        if (entry.label) {
          entry.label.style.color = modified ? '#00FF00' : '#666';
        }
      });
    };

    nodeType.prototype._updateBasicParamLabels = function() {
      BASIC_PARAMS.forEach(key => {
        const lbl = this._basicParamLabels[key];
        if (lbl) {
          const isModified = this._isParamModified(key);
          lbl.style.color = isModified ? '#00FF00' : '#aaa';
        }
      });
    };

    nodeType.prototype._getDefaultValueForKey = function(key) {
        if (DEFAULT_SLIDER_VALUES.hasOwnProperty(key)) {
            return DEFAULT_SLIDER_VALUES[key];
        }
        const nestedKeys = [
            'levels', 'exposure', 'color_balance', 'black_white', 'channel_mixer', 'selective_color'
        ];
        for (let section of nestedKeys) {
            if (DEFAULT_ADJUSTMENTS[section] && DEFAULT_ADJUSTMENTS[section].hasOwnProperty(key)) {
                return DEFAULT_ADJUSTMENTS[section][key];
            }
        }
        return 0;
    };

    nodeType.prototype._resetAllParameters = function() {
        const resetRecursive = (target, source) => {
            for (let key in source) {
                if (source.hasOwnProperty(key)) {
                    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
                        resetRecursive(target[key], source[key]);
                    } else {
                        target[key] = source[key];
                    }
                }
            }
        };
        resetRecursive(this.adjustments, DEFAULT_ADJUSTMENTS);

        Object.keys(this.overlayInputs).forEach(key => {
            const slider = this.overlayInputs[key];
            if (!slider) return;
            const defaultVal = this._getDefaultValueForKey(key);
            slider.value = defaultVal;
            if (this.sliderDisplays[key]) {
                const isFloat = Number.isFinite(defaultVal) && !Number.isInteger(defaultVal);
                this.sliderDisplays[key].textContent = isFloat ? defaultVal.toFixed(2) : String(Math.round(defaultVal));
            }
        });

        if (this._bwToggle) {
            this._bwToggle.checked = this.adjustments.bw_enabled || false;
        }

        const colorSelect = this.overlayContainer?.querySelector('#selective-color-select');
        if (colorSelect) {
            colorSelect.value = this.adjustments.selective_color.color_name || 'Reds';
        }

        const lutFileInput = this.overlayContainer?.querySelector('input[type="file"][accept=".cube"]');
        const lutFilenameDisplay = this.overlayContainer?.querySelector('.lut-filename-display');
        if (lutFileInput) lutFileInput.value = '';
        if (lutFilenameDisplay) {
            lutFilenameDisplay.textContent = 'File not selected';
            lutFilenameDisplay.style.color = '#888';
        }
        const lutIntensitySlider = this.overlayInputs['lut_intensity'];
        if (lutIntensitySlider) {
            lutIntensitySlider.value = this.adjustments.lut_intensity;
            if (this.sliderDisplays['lut_intensity']) {
                this.sliderDisplays['lut_intensity'].textContent = String(this.adjustments.lut_intensity);
            }
        }

        this._updateSectionHeaders();
        this._updateBasicParamLabels();

        this.previewImage = null;
        this.setDirtyCanvas(true);
        this._scheduleHeavyRender();

        this._syncWidgetsFromAdjustments();
    };

    nodeType.prototype._buildOverlayUI = function() {
      this.overlayContainer = document.createElement('div');
      this.overlayContainer.style.cssText = 'position:fixed;top:60px;left:0;right:0;bottom:0;background:rgba(10,10,10,0.96);z-index:999;display:none;flex-direction:row;align-items:stretch;font-family:system-ui,-apple-system,sans-serif;';

      this.overlayCanvasWrapper = document.createElement('div');
      this.overlayCanvasWrapper.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;';

      this.overlayCanvas = document.createElement('canvas');
      this.overlayCanvas.style.cssText = 'box-shadow:0 8px 32px rgba(0,0,0,0.7);max-width:98%;max-height:98%;border-radius:8px;';
      this.overlayCanvasWrapper.appendChild(this.overlayCanvas);
      this.overlayCtx = this.overlayCanvas.getContext('2d');

      this.sidePanel = document.createElement('div');
      this.sidePanel.style.cssText = 'width:320px;background:#151515;border-left:1px solid #333;padding:12px;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;overflow-y:auto;';

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'position:sticky;top:0;background:#151515;z-index:10;padding:0 0 8px 0;border-bottom:1px solid #333;margin-bottom:8px;';
      this.sidePanel.appendChild(buttonContainer);

      const makeBtn = (txt, col, onClick) => {
        const b = document.createElement('button');
        b.textContent = txt;
        b.style.cssText = `width:100%;padding:10px;background:#222;color:${col};border:1px solid ${col};border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;margin-top:4px;transition:0.15s;`;
        b.onmouseenter = () => { b.style.background = '#2a2a2a'; b.style.transform = 'translateY(-1px)'; };
        b.onmouseleave = () => { b.style.background = '#222'; b.style.transform = 'none'; };
        b.onclick = (e) => { e.stopPropagation(); onClick(); };
        return b;
      };

      const btnNormalMode = makeBtn("🟢 NORMAL MODE", "#2196F3", () => { this._toggleAdvancedMode(); });
      buttonContainer.appendChild(btnNormalMode);
      const btnApply = makeBtn("✔️ APPLY", "#4CAF50", () => { this._sendAdjustments(); this._toggleAdvancedMode(); });
      buttonContainer.appendChild(btnApply);
      const btnCancel = makeBtn("❌ CANCEL", "#dc3545", () => { this._cancelEditing(); this._toggleAdvancedMode(); });
      buttonContainer.appendChild(btnCancel);
      const bottomRow = document.createElement('div');
      bottomRow.style.cssText = 'display:flex;gap:8px;width:100%;';

      const btnResetAll = makeBtn("🔄 RESET ALL", "#FF9800", () => { this._resetAllParameters(); });
      btnResetAll.style.flex = '1';
      bottomRow.appendChild(btnResetAll);

      this._expandCollapseBtn = makeBtn("▶ EXPAND ALL", "#888", () => {
        this._allSectionsExpanded = !this._allSectionsExpanded;
        
        const display = this._allSectionsExpanded ? 'block' : 'none';
        const icon = this._allSectionsExpanded ? '▼' : '▶';
        const text = this._allSectionsExpanded ? '▼ COLLAPSE ALL' : '▶ EXPAND ALL';

        this._sectionRegistry.forEach(entry => {
          if (entry.content) entry.content.style.display = display;
          if (entry.chevron) entry.chevron.textContent = icon;
        });
        
        this._expandCollapseBtn.textContent = text;
      });
      this._expandCollapseBtn.style.flex = '1';
      bottomRow.appendChild(this._expandCollapseBtn);

      buttonContainer.appendChild(bottomRow);

      const makeSlider = (label, key, min, max, step, isFloat = false, parentObj = this.adjustments) => {
        const container = document.createElement('div');
        container.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.cssText = 'color:#aaa;font-size:11px;font-weight:600;';
        container.appendChild(lbl);
        if (BASIC_PARAMS.includes(key)) {
          this._basicParamLabels[key] = lbl;
        }
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = parentObj[key];
        slider.style.cssText = 'flex:1;height:4px;background:#252525;border-radius:2px;outline:none;cursor:pointer;-webkit-appearance:none;';
        const valueDisplay = document.createElement('div');
        valueDisplay.textContent = isFloat ? parseFloat(parentObj[key]).toFixed(2) : String(parseInt(parentObj[key]));
        valueDisplay.style.cssText = 'min-width:50px;text-align:center;background:#252525;color:#4CAF50;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;font-weight:600;transition:0.15s;';
        
        valueDisplay.onclick = (e) => {
          e.stopPropagation();
          const popup = document.createElement('div');
          popup.style.cssText = 'position:fixed;z-index:10004;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:8px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;';
          
          const input = document.createElement('input');
          input.type = 'number';
          input.value = parentObj[key];
          input.min = min;
          input.max = max;
          input.step = step;
          input.style.cssText = 'width:100px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:12px;outline:none;';
          
          const saveBtn = document.createElement('button');
          saveBtn.textContent = 'OK';
          saveBtn.style.cssText = 'background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;';
          
          const doSave = () => {
            let num = isFloat ? parseFloat(input.value) : parseInt(input.value);
            if (isNaN(num)) num = parentObj[key];
            num = Math.max(min, Math.min(max, num));
            parentObj[key] = num;
            slider.value = num;
            valueDisplay.textContent = isFloat ? num.toFixed(2) : String(num);
            this._updateSectionHeaders();
            this._updateBasicParamLabels();
            
            const widget = this.widgets?.find(w => w.name === key);
            if (widget) widget.value = num;
            
            this.previewImage = null;
            this.setDirtyCanvas(true);
            
            if (BASIC_PARAMS.includes(key)) {
            } else {
              this._scheduleHeavyRender();
            }
            popup.remove();
          };
          
          saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); doSave(); };
          input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doSave(); } };
          
          popup.appendChild(input);
          popup.appendChild(saveBtn);
          document.body.appendChild(popup);
          
          const popupWidth = popup.offsetWidth || 180;
          const popupHeight = popup.offsetHeight || 40;
          const rect = valueDisplay.getBoundingClientRect();
          let leftPos = rect.right + 8;
          let topPos = rect.top + (rect.height - popupHeight) / 2;
          
          if (leftPos + popupWidth > window.innerWidth - 10) {
            leftPos = rect.left - popupWidth - 8;
          }
          if (topPos < 10) topPos = 10;
          if (topPos + popupHeight > window.innerHeight - 10) {
            topPos = window.innerHeight - popupHeight - 10;
          }
          
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
        
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '🔄';
        resetBtn.style.cssText = 'width:28px;height:28px;background:#252525;color:#888;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:0.15s;flex-shrink:0;';
        resetBtn.onmouseenter = () => { resetBtn.style.background = '#2a2a2a'; resetBtn.style.color = '#fff'; resetBtn.style.borderColor = '#4CAF50'; };
        resetBtn.onmouseleave = () => { resetBtn.style.background = '#252525'; resetBtn.style.color = '#888'; resetBtn.style.borderColor = '#444'; };
        resetBtn.onclick = (e) => {
          e.stopPropagation();
          const defaultVal = DEFAULT_SLIDER_VALUES[key] !== undefined ? DEFAULT_SLIDER_VALUES[key] : (isFloat ? 0.0 : 0);
          parentObj[key] = defaultVal;
          slider.value = defaultVal;
          valueDisplay.textContent = isFloat ? parseFloat(defaultVal).toFixed(2) : String(parseInt(defaultVal));
          this._updateSectionHeaders();
          this._updateBasicParamLabels();
          
          this.setDirtyCanvas(true);
          
          if (BASIC_PARAMS.includes(key)) {
            this.previewImage = null;
          }
          this._scheduleHeavyRender();
        };
        
        slider.oninput = () => {
          const val = isFloat ? parseFloat(slider.value) : parseInt(slider.value);
          parentObj[key] = val;
          valueDisplay.textContent = isFloat ? val.toFixed(2) : String(val);
          this._updateSectionHeaders();
          this._updateBasicParamLabels();
          
          this.setDirtyCanvas(true);
          
          if (BASIC_PARAMS.includes(key)) {
            this.previewImage = null;
            const widget = this.widgets?.find(w => w.name === key);
            if (widget) widget.value = val;
          } else {
            this._scheduleHeavyRender();
          }
        };
        this.overlayInputs[key] = slider;
        this.sliderDisplays[key] = valueDisplay;
        row.appendChild(slider);
        row.appendChild(valueDisplay);
        row.appendChild(resetBtn);
        container.appendChild(row);
        return container;
      };

      const makeSection = (title, sectionName, contentBuilder) => {
        const section = document.createElement('div');
        section.style.cssText = 'margin-top:8px;';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;user-select:none;';
        const chevron = document.createElement('span');
        chevron.textContent = '▶';
        chevron.style.cssText = 'color:#666;font-size:12px;transition:transform 200ms;flex-shrink:0;';
        const lbl = document.createElement('label');
        lbl.textContent = title;
        lbl.style.cssText = `flex:1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;transition:color 200ms;color:#666;`;
        header.appendChild(chevron);
        header.appendChild(lbl);
        const content = document.createElement('div');
        content.style.cssText = 'display:none;padding-left:8px;';
        header.addEventListener('click', (e) => {
          const isOpen = content.style.display !== 'none';
          content.style.display = isOpen ? 'none' : 'block';
          chevron.textContent = isOpen ? '▶' : '▼';
        });
        section.appendChild(header);
        section.appendChild(content);
        contentBuilder(content);
        
        if (!this._sectionRegistry) this._sectionRegistry = [];
        this._sectionRegistry.push({ name: sectionName, label: lbl, content: content, chevron: chevron });
        
        return section;
      };

      const div = () => { const d = document.createElement('div'); d.style.cssText = 'height:1px;background:#333;margin:4px 0;'; return d; };

      const truncateFilename = (filename) => {
        if (!filename) return 'File not selected';
        if (filename.length <= 30) return filename;
        return filename.substring(0, 27) + '...';
      };

      this.sidePanel.appendChild(div());
      this.sidePanel.appendChild(makeSlider("BRIGHTNESS", "brightness", -100, 100, 1));
      this.sidePanel.appendChild(makeSlider("CONTRAST", "contrast", -100, 100, 1));
      this.sidePanel.appendChild(makeSlider("HUE", "hue", -180, 180, 1));
      this.sidePanel.appendChild(makeSlider("SATURATION", "saturation", -100, 100, 1));
      this.sidePanel.appendChild(div());

      const lutSection = makeSection("COLOR LOOKUP (LUT)", "lut", (content) => {
        const fileRow = document.createElement('div');
        fileRow.style.cssText = 'display:flex;align-items:center;gap:5px;';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.cube';
        fileInput.style.display = 'none';
        const filenameDisplay = document.createElement('div');
        filenameDisplay.className = 'lut-filename-display';
        filenameDisplay.textContent = 'File not selected';
        filenameDisplay.style.cssText = 'flex:1;padding:8px;background:#252525;color:#888;border:1px solid #444;border-radius:4px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:36px;display:flex;align-items:center;cursor:pointer;';
        const browseBtn = document.createElement('button');
        browseBtn.textContent = 'Browse';
        browseBtn.style.cssText = 'padding:8px 12px;background:#252525;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;transition:0.15s;flex-shrink:0;';
        browseBtn.onmouseenter = () => { browseBtn.style.background = '#2a2a2a'; browseBtn.style.color = '#fff'; browseBtn.style.borderColor = '#4CAF50'; };
        browseBtn.onmouseleave = () => { browseBtn.style.background = '#252525'; browseBtn.style.color = '#aaa'; browseBtn.style.borderColor = '#444'; };
        browseBtn.onclick = (e) => { e.stopPropagation(); fileInput.click(); };
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '🔄️';
        resetBtn.style.cssText = 'width:28px;height:28px;background:#252525;color:#888;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:0.15s;flex-shrink:0;';
        resetBtn.onmouseenter = () => { resetBtn.style.background = '#2a2a2a'; resetBtn.style.color = '#fff'; resetBtn.style.borderColor = '#4CAF50'; };
        resetBtn.onmouseleave = () => { resetBtn.style.background = '#252525'; resetBtn.style.color = '#888'; resetBtn.style.borderColor = '#444'; };
        resetBtn.onclick = (e) => {
          e.stopPropagation();
          fileInput.value = '';
          filenameDisplay.textContent = 'File not selected';
          filenameDisplay.style.color = '#888';
          this.adjustments.lut_path = '';
          this.adjustments.lut_intensity = 100;
          
          this.previewImage = null;
          this.setDirtyCanvas(true);
          this._updateSectionHeaders();
          this._scheduleHeavyRender();
        };
        fileInput.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          filenameDisplay.textContent = truncateFilename(file.name);
          filenameDisplay.style.color = '#eee';
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const blob = new Blob([ev.target.result], { type: 'text/plain' });
            const formData = new FormData();
            formData.append('image', blob, file.name);
            formData.append('subfolder', 'rs_adjustments');
            formData.append('type', 'temp');
            try {
              const resp = await api.fetchApi('/upload/image', { method: 'POST', body: formData });
              const data = await resp.json();
              this.adjustments.lut_path = data.name;
              this._updateSectionHeaders();
              
              this.previewImage = null;
              this.setDirtyCanvas(true);
              this._scheduleHeavyRender();
            } catch (err) {
              filenameDisplay.textContent = 'File not selected';
              filenameDisplay.style.color = '#888';
            }
          };
          reader.readAsText(file);
        };
        filenameDisplay.onclick = () => fileInput.click();
        fileRow.appendChild(filenameDisplay);
        fileRow.appendChild(browseBtn);
        fileRow.appendChild(resetBtn);
        fileRow.appendChild(fileInput);
        content.appendChild(fileRow);
        content.appendChild(div());
        content.appendChild(makeSlider("INTENSITY", "lut_intensity", 0, 100, 1));
      });
      this.sidePanel.appendChild(lutSection);

      const levelsSection = makeSection("LEVELS", "levels", (content) => {
        content.appendChild(makeSlider("INPUT BLACK", "input_black", 0, 255, 1, false, this.adjustments.levels));
        content.appendChild(makeSlider("GAMMA", "gamma", 0.1, 3.0, 0.01, true, this.adjustments.levels));
        content.appendChild(makeSlider("INPUT WHITE", "input_white", 0, 255, 1, false, this.adjustments.levels));
      });
      this.sidePanel.appendChild(levelsSection);

      const exposureSection = makeSection("EXPOSURE", "exposure", (content) => {
        content.appendChild(makeSlider("EXPOSURE", "exposure", -100, 100, 1, false, this.adjustments.exposure));
        content.appendChild(makeSlider("OFFSET", "offset", -100, 100, 1, false, this.adjustments.exposure));
      });
      this.sidePanel.appendChild(exposureSection);

      const colorBalanceSection = makeSection("COLOR BALANCE", "color_balance", (content) => {
        const shadowsLabel = document.createElement('div');
        shadowsLabel.textContent = 'SHADOWS';
        shadowsLabel.style.cssText = 'color:#888;font-size:10px;font-weight:600;margin:8px 0 4px 0;';
        content.appendChild(shadowsLabel);
        content.appendChild(makeSlider("CYAN / RED", "shadows_cyan_red", -100, 100, 1, false, this.adjustments.color_balance));
        content.appendChild(makeSlider("MAGENTA / GREEN", "shadows_magenta_green", -100, 100, 1, false, this.adjustments.color_balance));
        content.appendChild(makeSlider("YELLOW / BLUE", "shadows_yellow_blue", -100, 100, 1, false, this.adjustments.color_balance));
        const midtonesLabel = document.createElement('div');
        midtonesLabel.textContent = 'MIDTONES';
        midtonesLabel.style.cssText = 'color:#888;font-size:10px;font-weight:600;margin:8px 0 4px 0;';
        content.appendChild(midtonesLabel);
        content.appendChild(makeSlider("CYAN / RED", "midtones_cyan_red", -100, 100, 1, false, this.adjustments.color_balance));
        content.appendChild(makeSlider("MAGENTA / GREEN", "midtones_magenta_green", -100, 100, 1, false, this.adjustments.color_balance));
        content.appendChild(makeSlider("YELLOW / BLUE", "midtones_yellow_blue", -100, 100, 1, false, this.adjustments.color_balance));
        const highlightsLabel = document.createElement('div');
        highlightsLabel.textContent = 'HIGHLIGHTS';
        highlightsLabel.style.cssText = 'color:#888;font-size:10px;font-weight:600;margin:8px 0 4px 0;';
        content.appendChild(highlightsLabel);
        content.appendChild(makeSlider("CYAN / RED", "highlights_cyan_red", -100, 100, 1, false, this.adjustments.color_balance));
        content.appendChild(makeSlider("MAGENTA / GREEN", "highlights_magenta_green", -100, 100, 1, false, this.adjustments.color_balance));
        content.appendChild(makeSlider("YELLOW / BLUE", "highlights_yellow_blue", -100, 100, 1, false, this.adjustments.color_balance));
      });
      this.sidePanel.appendChild(colorBalanceSection);

      const bwSection = makeSection("BLACK & WHITE", "black_white", (content) => {
          const toggleRow = document.createElement('div');
          toggleRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin:4px 0 8px 0;';

          const toggleLabel = document.createElement('label');
          toggleLabel.textContent = 'Enable B&W';
          toggleLabel.style.cssText = 'color:#aaa;font-size:11px;font-weight:600;';

          const toggleInput = document.createElement('input');
          toggleInput.type = 'checkbox';
          toggleInput.checked = this.adjustments.bw_enabled || false;
          toggleInput.style.cssText = 'width:18px;height:18px;accent-color:#4CAF50;cursor:pointer;';

          this._bwToggle = toggleInput;

          toggleInput.onchange = () => {
              this.adjustments.bw_enabled = toggleInput.checked;
              this.previewImage = null;
              this.setDirtyCanvas(true);
              this._scheduleHeavyRender();
          };

          toggleRow.appendChild(toggleLabel);
          toggleRow.appendChild(toggleInput);
          content.appendChild(toggleRow);

          content.appendChild(makeSlider("RED", "bw_red", 0, 200, 1, false, this.adjustments.black_white));
          content.appendChild(makeSlider("YELLOW", "bw_yellow", 0, 200, 1, false, this.adjustments.black_white));
          content.appendChild(makeSlider("GREEN", "bw_green", 0, 200, 1, false, this.adjustments.black_white));
          content.appendChild(makeSlider("CYAN", "bw_cyan", 0, 200, 1, false, this.adjustments.black_white));
          content.appendChild(makeSlider("BLUE", "bw_blue", 0, 200, 1, false, this.adjustments.black_white));
          content.appendChild(makeSlider("MAGENTA", "bw_magenta", 0, 200, 1, false, this.adjustments.black_white));
      });
      this.sidePanel.appendChild(bwSection);

      const channelMixerSection = makeSection("CHANNEL MIXER", "channel_mixer", (content) => {
        const redLabel = document.createElement('div');
        redLabel.textContent = 'OUTPUT RED';
        redLabel.style.cssText = 'color:#888;font-size:10px;font-weight:600;margin:8px 0 4px 0;';
        content.appendChild(redLabel);
        content.appendChild(makeSlider("RED", "red_red", -200, 200, 1, false, this.adjustments.channel_mixer));
        content.appendChild(makeSlider("GREEN", "red_green", -200, 200, 1, false, this.adjustments.channel_mixer));
        content.appendChild(makeSlider("BLUE", "red_blue", -200, 200, 1, false, this.adjustments.channel_mixer));
        const greenLabel = document.createElement('div');
        greenLabel.textContent = 'OUTPUT GREEN';
        greenLabel.style.cssText = 'color:#888;font-size:10px;font-weight:600;margin:8px 0 4px 0;';
        content.appendChild(greenLabel);
        content.appendChild(makeSlider("RED", "green_red", -200, 200, 1, false, this.adjustments.channel_mixer));
        content.appendChild(makeSlider("GREEN", "green_green", -200, 200, 1, false, this.adjustments.channel_mixer));
        content.appendChild(makeSlider("BLUE", "green_blue", -200, 200, 1, false, this.adjustments.channel_mixer));
        const blueLabel = document.createElement('div');
        blueLabel.textContent = 'OUTPUT BLUE';
        blueLabel.style.cssText = 'color:#888;font-size:10px;font-weight:600;margin:8px 0 4px 0;';
        content.appendChild(blueLabel);
        content.appendChild(makeSlider("RED", "blue_red", -200, 200, 1, false, this.adjustments.channel_mixer));
        content.appendChild(makeSlider("GREEN", "blue_green", -200, 200, 1, false, this.adjustments.channel_mixer));
        content.appendChild(makeSlider("BLUE", "blue_blue", -200, 200, 1, false, this.adjustments.channel_mixer));
      });
      this.sidePanel.appendChild(channelMixerSection);

      const selectiveColorSection = makeSection("SELECTIVE COLOR", "selective_color", (content) => {
        const colorSelect = document.createElement('select');
        colorSelect.id = 'selective-color-select';
        colorSelect.style.cssText = 'width:100%;background:#252525;color:#eee;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px;outline:none;margin-bottom:8px;';
        ['Reds', 'Yellows', 'Greens', 'Cyans', 'Blues', 'Magentas', 'Whites', 'Neutrals', 'Blacks'].forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.textContent = c;
          if (c === this.adjustments.selective_color.color_name) opt.selected = true;
          colorSelect.appendChild(opt);
        });
        colorSelect.onchange = () => {
          this.adjustments.selective_color.color_name = colorSelect.value;
          this.previewImage = null;
          this.setDirtyCanvas(true);
          this._scheduleHeavyRender();
        };
        content.appendChild(colorSelect);
        content.appendChild(makeSlider("CYAN", "sc_cyan", -100, 100, 1, false, this.adjustments.selective_color));
        content.appendChild(makeSlider("MAGENTA", "sc_magenta", -100, 100, 1, false, this.adjustments.selective_color));
        content.appendChild(makeSlider("YELLOW", "sc_yellow", -100, 100, 1, false, this.adjustments.selective_color));
        content.appendChild(makeSlider("BLACK", "sc_black", -100, 100, 1, false, this.adjustments.selective_color));
      });
      this.sidePanel.appendChild(selectiveColorSection);

      this.overlayContainer.appendChild(this.overlayCanvasWrapper);
      this.overlayContainer.appendChild(this.sidePanel);
      document.body.appendChild(this.overlayContainer);
    };

    nodeType.prototype._scheduleBasicRender = function() {
      this._syncWidgetsFromAdjustments();
      this.setDirtyCanvas(true);
    };

    nodeType.prototype._scheduleHeavyRender = function() {
      if (this._isHeavyRenderPending) {
        return;
      }
      
      const now = Date.now();
      if (now - this._lastHeavyRenderTime < 50) {
        return;
      }
      
      this._lastHeavyRenderTime = now;
      this._syncWidgetsFromAdjustments();
      
      if (this._wsConnected) {
        this._sendPreviewViaWebSocket();
      } else {
        this._fetchPreviewFromServer();
      }
    };

    nodeType.prototype._fetchPreviewFromServer = async function() {
      if (!this.isEditing || !this.backgroundImage) return;
      if (this.currentRenderAbortController) {
        this.currentRenderAbortController.abort();
      }
      this.currentRenderAbortController = new AbortController();
      const signal = this.currentRenderAbortController.signal;
      this._isHeavyRenderPending = true;

      const payload = {
        node_id: String(this.id),
        image_file: this.pendingEditorData.bg_file,
        adjustments: this.adjustments
      };

      try {
        const response = await api.fetchApi('/rayko/rs_adjustments/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: signal
        });
        const data = await response.json();
        if (data.preview_file) {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          const ts = data.timestamp;
          this._previewTimestamp = ts;
          img.onload = () => {
            if (this._previewTimestamp === ts) {
              this.previewImage = img;
              this.setDirtyCanvas(true);
              this._isHeavyRenderPending = false;
            }
          };
          img.onerror = () => {
            this._isHeavyRenderPending = false;
          };
          img.src = `/view?filename=${data.preview_file}&type=temp&t=${ts}`;
        }
      } catch (e) {
        this._isHeavyRenderPending = false;
        if (e.name === 'AbortError') return;
      }
    };

    nodeType.prototype._initWebSocket = function() {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        return;
      }
      
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${location.host}/rayko/rs_adjustments/ws`;
      
      this._ws = new WebSocket(wsUrl);
      this._ws.binaryType = 'blob';
      
      this._ws.onopen = () => {
        console.log('[RS Adjustments] WebSocket connected');
        this._wsConnected = true;
        if (this._wsReconnectTimer) {
          clearTimeout(this._wsReconnectTimer);
          this._wsReconnectTimer = null;
        }
      };
      
      this._ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          const url = URL.createObjectURL(event.data);
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.onload = () => {
            this.previewImage = img;
            this.setDirtyCanvas(true);
            URL.revokeObjectURL(url);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
          };
          img.src = url;
        } else if (event.data instanceof ArrayBuffer) {
          const blob = new Blob([event.data], { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            this.previewImage = img;
            this.setDirtyCanvas(true);
            URL.revokeObjectURL(url);
          };
          img.src = url;
        }
      };
      
      this._ws.onclose = () => {
        console.log('[RS Adjustments] WebSocket disconnected');
        this._wsConnected = false;
        if (!this._wsReconnectTimer) {
          this._wsReconnectTimer = setTimeout(() => {
            this._initWebSocket();
          }, 2000);
        }
      };
      
      this._ws.onerror = (error) => {
        console.error('[RS Adjustments] WebSocket error:', error);
        this._ws.close();
      };
    };

    nodeType.prototype._sendPreviewViaWebSocket = function() {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        this._fetchPreviewFromServer();
        return;
      }
      
      const payload = {
        node_id: String(this.id),
        image_file: this.pendingEditorData.bg_file,
        adjustments: this.adjustments
      };
      
      this._ws.send(JSON.stringify(payload));
    };

    nodeType.prototype._openDeferredEditor = function() {
      if (!this.pendingEditorData) return;
      this.backgroundImage = null;
      this.previewImage = null;
      this.originalImageData = null;
      this.isLoading = true;
      this.isEditing = false;
      this._hideNativeWidgets();
      
      const data = this.pendingEditorData;
      this.adjustments.brightness = data.brightness || 0;
      this.adjustments.contrast = data.contrast || 0;
      this.adjustments.hue = data.hue || 0;
      this.adjustments.saturation = data.saturation || 0;
      
      try {
        const adv = JSON.parse(data.advanced_params || "{}");
        Object.keys(adv).forEach(key => {
          if (this.adjustments[key] !== undefined) {
            this.adjustments[key] = adv[key];
          }
        });
      } catch (e) {}

      this.realBackground = { width: data.bg_width, height: data.bg_height };
      this._updateDisplaySize(this.canvasPixelSize);

      const bgFile = data.bg_file, ts = data.timestamp;
      const img = new Image();
      img.crossOrigin = "Anonymous";
      const imageUrl = `/view?filename=${bgFile}&type=temp&t=${ts}_${Date.now()}`;
      
      img.onload = () => {
        this.backgroundImage = img;
        this.isLoading = false;
        this.isEditing = true;
        this._initWebSocket();
        
        this._tempCanvas.width = img.width;
        this._tempCanvas.height = img.height;
        this._tempCtx.drawImage(img, 0, 0);
        this.originalImageData = this._tempCtx.getImageData(0, 0, img.width, img.height);
        
        this.setDirtyCanvas(true, true);
        if (app.graph) app.graph.setDirtyCanvas(true, true);
        this._syncWidgetsFromAdjustments();
        this._syncOverlayUI();
        this._updateBasicParamLabels();
        this._scheduleHeavyRender();
      };
      img.onerror = () => {
        this.isLoading = false;
        this.isEditing = false;
        this.setDirtyCanvas(true);
      };
      img.src = imageUrl;
    };

    nodeType.prototype._updateDisplaySize = function(cS) {
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

    nodeType.prototype._toggleAdvancedMode = function(forceClose = false) {
      if (forceClose || this.advancedMode) {
        this.advancedMode = false;
        if (activeNodeId === this.id) activeNodeId = null;
        this.overlayContainer.style.display = 'none';
        if (this._overlayRenderLoop) {
          cancelAnimationFrame(this._overlayRenderLoop);
          this._overlayRenderLoop = null;
        }
      if (this._ws) {
        this._ws.close();
        this._ws = null;
        this._wsConnected = false;
      }
      if (this._wsReconnectTimer) {
        clearTimeout(this._wsReconnectTimer);
        this._wsReconnectTimer = null;
      }
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
      this._syncOverlayUI();
      requestAnimationFrame(() => {
        this._resizeOverlayCanvas();
        this._updateSectionHeaders();
        this._startOverlayRenderLoop();
      });
    };

    nodeType.prototype._resizeOverlayCanvas = function() {
      if (!this.overlayCanvasWrapper || !this.overlayCanvas) return;
      const w = this.overlayCanvasWrapper.clientWidth;
      const h = this.overlayCanvasWrapper.clientHeight;
      if (w > 0 && h > 0) {
        this.overlayCanvas.width = w;
        this.overlayCanvas.height = h;
        this.setDirtyCanvas(true);
      }
    };

    nodeType.prototype._startOverlayRenderLoop = function() {
      if (this._overlayRenderLoop) return;
      const render = () => {
        if (!this.advancedMode) return;
        this._drawOverlayCanvas();
        this._overlayRenderLoop = requestAnimationFrame(render);
      };
      this._overlayRenderLoop = requestAnimationFrame(render);
    };

    nodeType.prototype._drawOverlayCanvas = function() {
      if (!this.advancedMode || !this.overlayCtx) return;
      const ctx = this.overlayCtx;
      const w = this.overlayCanvas.width;
      const h = this.overlayCanvas.height;
      ctx.clearRect(0, 0, w, h);
      if (this.isLoading) {
        ctx.fillStyle = "#888";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Loading...", w / 2, h / 2);
        return;
      }
      if (!this.backgroundImage) return;
      const safeDW = this.displayWidth > 0 ? this.displayWidth : 100;
      const safeDH = this.displayHeight > 0 ? this.displayHeight : 100;
      const scale = Math.min(w / safeDW, h / safeDH);
      const drawW = safeDW * scale;
      const drawH = safeDH * scale;
      const drawX = (w - drawW) / 2;
      const drawY = (h - drawH) / 2;

      if (this.previewImage) {
        ctx.drawImage(this.previewImage, drawX, drawY, drawW, drawH);
      } else if (this.originalImageData) {
        const processed = new ImageData(
          new Uint8ClampedArray(this.originalImageData.data),
          this.originalImageData.width,
          this.originalImageData.height
        );
        applyBasicAdjustmentsJS(processed, this.adjustments.brightness, this.adjustments.contrast, this.adjustments.hue, this.adjustments.saturation);
        this._tempCanvas.width = processed.width;
        this._tempCanvas.height = processed.height;
        this._tempCtx.putImageData(processed, 0, 0);
        ctx.drawImage(this._tempCanvas, drawX, drawY, drawW, drawH);
      } else {
        ctx.drawImage(this.backgroundImage, drawX, drawY, drawW, drawH);
      }
    };

    nodeType.prototype._sendAdjustments = async function() {
      if (this.currentRenderAbortController) {
        this.currentRenderAbortController.abort();
        this.currentRenderAbortController = null;
      }
      const payload = { id: String(this.id), adjustments: this.adjustments };
      try {
        await api.fetchApi("/rayko/rs_adjustments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        this.isEditing = false;
        this.setDirtyCanvas(true);
      } catch(e) {}
    };

    nodeType.prototype._cancelEditing = async function() {
      if (this.currentRenderAbortController) {
        this.currentRenderAbortController.abort();
        this.currentRenderAbortController = null;
      }
      clearTimeout(this.renderTimeout);
      try { await api.interrupt(); } catch(e) {}
      await fetch("/rayko/rs_adjustments/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: String(this.id) }) });
      this._cleanup();
    };

    nodeType.prototype._cleanup = function() {
      this.isEditing = false;
      this.isLoading = false;
      this.backgroundImage = null;
      this.previewImage = null;
      this.originalImageData = null;
      this.pendingEditorData = null;
      this.sliderDragging = -1;
      if (this._overlayRenderLoop) {
        cancelAnimationFrame(this._overlayRenderLoop);
        this._overlayRenderLoop = null;
      }
      this.setDirtyCanvas(true);
    };

    nodeType.prototype.onResize = function(size) {
      if (size[0] < this.minWidth) size[0] = this.minWidth;
      const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
      const canvasTopPadding = 30;
      const cSize = Math.max(200, size[0] - 40);
      this.canvasPixelSize = cSize;
      
      const slidersH = 4 * 30 + 10;
      const btnH = 30;
      const gaps = 10 + 8 + 8 + 20 + 15;
      const neededHeight = titleH + canvasTopPadding + cSize + slidersH + btnH + gaps;
      if (size[1] < neededHeight) size[1] = neededHeight;
      
      this.setDirtyCanvas(true);
      if (this.isEditing && this.backgroundImage) {
        this._updateDisplaySize(cSize);
      }
    };

    nodeType.prototype._getCanvasMetrics = function() {
      const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
      const canvasTopPadding = 30;
      let cSize, rectX, rectY;
      if (this.advancedMode) {
        cSize = Math.min(this.overlayCanvas.width || 1000, this.overlayCanvas.height || 800);
        rectX = 0; rectY = 0;
      } else {
        cSize = Math.max(200, this.size[0] - 40);
        rectX = (this.size[0] - cSize) / 2;
        rectY = titleH + canvasTopPadding;
      }
      return { cSize, rectX, rectY };
    };

    nodeType.prototype._roundRect = function(ctx, x, y, w, h, r) {
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

    nodeType.prototype._drawSlider = function(ctx, label, value, min, max, x, y, w, h, isHover, isActive) {
      ctx.fillStyle = isHover ? "#2a2a2a" : "#252525";
      ctx.strokeStyle = isActive ? "#4CAF50" : (isHover ? "#4CAF50" : "#444");
      ctx.lineWidth = 1;
      this._roundRect(ctx, x, y, w, h, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#aaa";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 8, y + h / 2);

      const trackX = x + 90;
      const trackW = w - 190;
      const trackY = y + h / 2;
      const trackH = 3;

      ctx.fillStyle = "#444";
      ctx.fillRect(trackX, trackY - trackH / 2, trackW, trackH);

      const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
      const fillW = trackW * ratio;
      ctx.fillStyle = "#4CAF50";
      ctx.fillRect(trackX, trackY - trackH / 2, fillW, trackH);

      const handleX = trackX + fillW;
      const handleSize = 12;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(handleX, trackY, handleSize / 2, 0, Math.PI * 2);
      ctx.fill();

      const valueW = 50;
      const valueX = x + w - valueW - 38;
      ctx.fillStyle = "#222";
      ctx.strokeStyle = "#444";
      this._roundRect(ctx, valueX, y + 3, valueW, h - 6, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#4CAF50";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(value)), valueX + valueW / 2, y + h / 2);

      const resetBtnSize = 24;
      const resetBtnX = x + w - resetBtnSize - 8;
      const resetBtnY = y + (h - resetBtnSize) / 2;
      ctx.fillStyle = "#252525";
      ctx.strokeStyle = "#444";
      this._roundRect(ctx, resetBtnX, resetBtnY, resetBtnSize, resetBtnSize, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#888";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🔄", resetBtnX + resetBtnSize / 2, resetBtnY + resetBtnSize / 2);

      return { x: trackX - 6, y: y, w: trackW + 12, h: h, resetBtnX, resetBtnY, resetBtnSize, valueX, valueY: y, valueW, valueH: h };
    };

    nodeType.prototype.onDrawForeground = function(ctx) {
      if (this.advancedMode) {
        ctx.clearRect(0, 0, this.size[0], this.size[1]);
        return;
      }

      const { cSize, rectX, rectY } = this._getCanvasMetrics();
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(rectX, rectY, cSize, cSize);
      ctx.strokeStyle = "#555";
      ctx.strokeRect(rectX, rectY, cSize, cSize);

      this._updateDisplaySize(cSize);

      if (this.isLoading) {
        ctx.fillStyle = "#888";
        ctx.font = "12px Arial";
        ctx.fillText("Loading...", rectX + cSize / 2 - 35, rectY + cSize / 2);
      } else if (this.isEditing && this.backgroundImage) {
        try {
          const safeDW = this.displayWidth > 0 ? this.displayWidth : 100;
          const safeDH = this.displayHeight > 0 ? this.displayHeight : 100;

          ctx.save();
          ctx.translate(rectX, rectY);

          const scale = Math.min(cSize / safeDW, cSize / safeDH);
          const drawW = safeDW * scale;
          const drawH = safeDH * scale;
          const drawX = (cSize - drawW) / 2;
          const drawY = (cSize - drawH) / 2;

          if (this.previewImage) {
            ctx.drawImage(this.previewImage, drawX, drawY, drawW, drawH);
          } else if (this.originalImageData) {
            const processed = new ImageData(
              new Uint8ClampedArray(this.originalImageData.data),
              this.originalImageData.width,
              this.originalImageData.height
            );
            applyBasicAdjustmentsJS(processed, this.adjustments.brightness, this.adjustments.contrast, this.adjustments.hue, this.adjustments.saturation);
            this._tempCanvas.width = processed.width;
            this._tempCanvas.height = processed.height;
            this._tempCtx.putImageData(processed, 0, 0);
            ctx.drawImage(this._tempCanvas, drawX, drawY, drawW, drawH);
          } else {
            ctx.drawImage(this.backgroundImage, drawX, drawY, drawW, drawH);
          }

          ctx.restore();
        } catch (e) {
          console.error('[RS Adjustments] FATAL DRAW ERROR:', e);
        }
      } else {
        ctx.fillStyle = "#888";
        ctx.font = "12px Arial";
        ctx.fillText("▶ Run queue to start", rectX + cSize / 2 - 65, rectY + cSize / 2);
      }

      const btnW = 140;
      const btnH = 24;
      const gap = 10;
      const totalW = btnW * 2 + gap;
      const startX = (this.size[0] - totalW) / 2;
      const btnY = 20;

      const advBtnX = startX;
      ctx.fillStyle = this.btnAdvancedHover ? "#3a3a3a" : "#2a2a2a";
      ctx.strokeStyle = "#2196F3";
      ctx.lineWidth = 2;
      this._roundRect(ctx, advBtnX, btnY, btnW, btnH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2196F3";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("✨ ADVANCED", advBtnX + btnW/2, btnY + btnH/2 + 4);

      const resetBtnX = startX + btnW + gap;
      ctx.fillStyle = this.btnResetAllHover ? "#3a3a3a" : "#2a2a2a";
      ctx.strokeStyle = "#FF9800";
      ctx.lineWidth = 2;
      this._roundRect(ctx, resetBtnX, btnY, btnW, btnH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#FF9800";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("🔄 RESET ALL", resetBtnX + btnW/2, btnY + btnH/2 + 4);

      const widgetX = 15;
      const widgetW = this.size[0] - 30;
      const slidersY = rectY + cSize + 10;
      this.slidersY = slidersY;
      this.sliderRects = [];
      this.resetBtnRects = [];

      const sliderH = 30;
      const gapSlider = 8;
      const sliderConfigs = [
        { label: "BRIGHTNESS", key: "brightness", min: -100, max: 100 },
        { label: "CONTRAST", key: "contrast", min: -100, max: 100 },
        { label: "HUE", key: "hue", min: -180, max: 180 },
        { label: "SATURATION", key: "saturation", min: -100, max: 100 }
      ];

      sliderConfigs.forEach((cfg, i) => {
        const y = slidersY + i * (sliderH + gapSlider);
        const rect = this._drawSlider(ctx, cfg.label, this.adjustments[cfg.key], cfg.min, cfg.max, widgetX, y, widgetW, sliderH, this.sliderHover[i], this.sliderDragging === i);
        this.sliderRects.push({ ...rect, key: cfg.key, min: cfg.min, max: cfg.max });
        
        const resetBtnRect = {
          x: rect.resetBtnX,
          y: rect.resetBtnY,
          w: rect.resetBtnSize,
          h: rect.resetBtnSize,
          key: cfg.key
        };
        this.resetBtnRects.push(resetBtnRect);
        
        if (this.resetBtnHover[i]) {
          ctx.strokeStyle = "#4CAF50";
          ctx.lineWidth = 1.5;
          this._roundRect(ctx, resetBtnRect.x, resetBtnRect.y, resetBtnRect.w, resetBtnRect.h, 4);
          ctx.stroke();
        }
      });

      const buttonsY = slidersY + 4 * (sliderH + gapSlider) + 10;
      const btnH2 = 30;
      const btnGap2 = 10;
      const btnW2 = (this.size[0] - 35) / 2;

      ctx.fillStyle = this.btnApplyHover ? "#444" : "#2a2a2a";
      this._roundRect(ctx, 15, buttonsY, btnW2, btnH2, 6);
      ctx.fill();
      ctx.strokeStyle = "#4CAF50";
      ctx.stroke();
      ctx.fillStyle = "#4CAF50";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("✔️ APPLY", 15 + btnW2 / 2, buttonsY + btnH2 / 2 + 4);

      ctx.fillStyle = this.btnCancelHover ? "#444" : "#2a2a2a";
      this._roundRect(ctx, 15 + btnW2 + btnGap2, buttonsY, btnW2, btnH2, 6);
      ctx.fill();
      ctx.strokeStyle = "#dc3545";
      ctx.stroke();
      ctx.fillStyle = "#dc3545";
      ctx.fillText("❌ CANCEL", 15 + btnW2 + btnGap2 + btnW2 / 2, buttonsY + btnH2 / 2 + 4);
    };

    nodeType.prototype.onMouseDown = function(event, pos) {
      if (!this.advancedMode && pos) {
        const btnW = 140;
        const btnH = 24;
        const gap = 10;
        const totalW = btnW * 2 + gap;
        const startX = (this.size[0] - totalW) / 2;
        const btnY = 20;
        const advBtnX = startX;
        const resetBtnX = startX + btnW + gap;

        if (pos[0] >= advBtnX && pos[0] <= advBtnX + btnW && pos[1] >= btnY && pos[1] <= btnY + btnH) {
          this._toggleAdvancedMode();
          return true;
        }
        if (pos[0] >= resetBtnX && pos[0] <= resetBtnX + btnW && pos[1] >= btnY && pos[1] <= btnY + btnH) {
          this._resetAllParameters();
          return true;
        }
      }

      if (this.sliderRects && pos) {
        for (let i = 0; i < this.sliderRects.length; i++) {
          const rect = this.sliderRects[i];
          if (rect.valueX !== undefined && pos[0] >= rect.valueX && pos[0] <= rect.valueX + rect.valueW && pos[1] >= rect.valueY && pos[1] <= rect.valueY + rect.valueH) {
            this._showValueInputPopup(i, event);
            return true;
          }
        }
      }

      if (this.sliderRects && pos) {
        for (let i = 0; i < this.sliderRects.length; i++) {
          const rect = this.sliderRects[i];
          if (pos[0] >= rect.x && pos[0] <= rect.x + rect.w && pos[1] >= rect.y && pos[1] <= rect.y + rect.h) {
            this.sliderDragging = i;
            this._updateSliderFromMouse(i, pos[0]);
            return true;
          }
        }
      }

      if (this.resetBtnRects && pos) {
        for (let i = 0; i < this.resetBtnRects.length; i++) {
          const rect = this.resetBtnRects[i];
          if (pos[0] >= rect.x && pos[0] <= rect.x + rect.w && pos[1] >= rect.y && pos[1] <= rect.y + rect.h) {
            const defaultVal = DEFAULT_SLIDER_VALUES[rect.key] !== undefined ? DEFAULT_SLIDER_VALUES[rect.key] : 0;
            this.adjustments[rect.key] = defaultVal;
            const widget = this.widgets?.find(w => w.name === rect.key);
            if (widget) widget.value = defaultVal;
            this.previewImage = null;
            this.setDirtyCanvas(true);
            return true;
          }
        }
      }

      if (pos && this.slidersY !== undefined) {
        const btnH2 = 30;
        const btnGap2 = 10;
        const btnW2 = (this.size[0] - 35) / 2;
        const buttonsY = this.slidersY + 4 * 38 + 10;
        const y1 = buttonsY;

        if (pos[0] >= 15 && pos[0] <= 15 + btnW2 && pos[1] >= y1 && pos[1] <= y1 + btnH2) {
          this._sendAdjustments();
          return true;
        }
        if (pos[0] >= 15 + btnW2 + btnGap2 && pos[0] <= 15 + btnW2 + btnGap2 + btnW2 && pos[1] >= y1 && pos[1] <= y1 + btnH2) {
          this._cancelEditing();
          return true;
        }
      }

      return false;
    };

    nodeType.prototype.onMouseMove = function(event, pos) {
      if (this.sliderDragging >= 0 && event && event.buttons === 0) {
        this.sliderDragging = -1;
        this.setDirtyCanvas(true);
        return;
      }

      if (this.sliderDragging >= 0 && pos) {
        this._updateSliderFromMouse(this.sliderDragging, pos[0]);
        return;
      }

      if (pos && !this.advancedMode) {
        const btnW = 140;
        const btnH = 24;
        const gap = 10;
        const totalW = btnW * 2 + gap;
        const startX = (this.size[0] - totalW) / 2;
        const btnY = 20;
        const advBtnX = startX;
        const resetBtnX = startX + btnW + gap;

        const prevAdv = this.btnAdvancedHover;
        const prevReset = this.btnResetAllHover;
        this.btnAdvancedHover = pos[0] >= advBtnX && pos[0] <= advBtnX + btnW && pos[1] >= btnY && pos[1] <= btnY + btnH;
        this.btnResetAllHover = pos[0] >= resetBtnX && pos[0] <= resetBtnX + btnW && pos[1] >= btnY && pos[1] <= btnY + btnH;
        if (prevAdv !== this.btnAdvancedHover || prevReset !== this.btnResetAllHover) {
          this.setDirtyCanvas(true);
        }
      }

      const prevHover = [...this.sliderHover];
      const prevResetHover = [...this.resetBtnHover];
      
      if (this.sliderRects && pos) {
        for (let i = 0; i < this.sliderRects.length; i++) {
          const rect = this.sliderRects[i];
          this.sliderHover[i] = pos[0] >= rect.x && pos[0] <= rect.x + rect.w && pos[1] >= rect.y && pos[1] <= rect.y + rect.h;
        }
      }
      
      if (this.resetBtnRects && pos) {
        for (let i = 0; i < this.resetBtnRects.length; i++) {
          const rect = this.resetBtnRects[i];
          this.resetBtnHover[i] = pos[0] >= rect.x && pos[0] <= rect.x + rect.w && pos[1] >= rect.y && pos[1] <= rect.y + rect.h;
        }
      }
      
      if (prevHover.some((v, i) => v !== this.sliderHover[i]) || prevResetHover.some((v, i) => v !== this.resetBtnHover[i])) {
        this.setDirtyCanvas(true);
      }

      if (pos && this.slidersY !== undefined) {
        const btnH2 = 30;
        const btnGap2 = 10;
        const btnW2 = (this.size[0] - 35) / 2;
        const buttonsY = this.slidersY + 4 * 38 + 10;
        const y1 = buttonsY;

        const prevApply = this.btnApplyHover;
        const prevCancel = this.btnCancelHover;
        this.btnApplyHover = pos[0] >= 15 && pos[0] <= 15 + btnW2 && pos[1] >= y1 && pos[1] <= y1 + btnH2;
        this.btnCancelHover = pos[0] >= 15 + btnW2 + btnGap2 && pos[0] <= 15 + btnW2 + btnGap2 + btnW2 && pos[1] >= y1 && pos[1] <= y1 + btnH2;

        if (prevApply !== this.btnApplyHover || prevCancel !== this.btnCancelHover) this.setDirtyCanvas(true);
      }
    };

    nodeType.prototype.onMouseUp = function() {
      if (this.sliderDragging >= 0) {
        this.sliderDragging = -1;
        this.setDirtyCanvas(true);
      }
    };

    nodeType.prototype._updateSliderFromMouse = function(index, mouseX) {
      if (!this.sliderRects || !this.sliderRects[index]) return;
      const rect = this.sliderRects[index];
      const ratio = Math.max(0, Math.min(1, (mouseX - rect.x) / rect.w));
      const value = Math.round(rect.min + ratio * (rect.max - rect.min));
      this.adjustments[rect.key] = value;
      
      const widget = this.widgets?.find(w => w.name === rect.key);
      if (widget) widget.value = value;
      
      if (this.advancedMode) {
        if (this.overlayInputs[rect.key]) {
          this.overlayInputs[rect.key].value = value;
        }
        if (this.sliderDisplays[rect.key]) {
          this.sliderDisplays[rect.key].textContent = String(value);
        }
      }
      
      this.previewImage = null;
      this.setDirtyCanvas(true);
    };

    nodeType.prototype._showValueInputPopup = function(index, event) {
      if (!this.sliderRects || !this.sliderRects[index]) return;
      const rect = this.sliderRects[index];
      const currentValue = this.adjustments[rect.key];
      
      const screenX = event.clientX;
      const screenY = event.clientY;
      
      const popup = document.createElement('div');
      popup.style.cssText = 'position:fixed;z-index:10003;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:8px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;';
      
      const input = document.createElement('input');
      input.type = 'number';
      input.value = currentValue;
      input.min = rect.min;
      input.max = rect.max;
      input.step = 1;
      input.style.cssText = 'width:100px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:12px;outline:none;';
      
      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'OK';
      saveBtn.style.cssText = 'background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;';
      
      const doSave = () => {
        let num = parseInt(input.value);
        if (isNaN(num)) num = currentValue;
        num = Math.max(rect.min, Math.min(rect.max, num));
        this.adjustments[rect.key] = num;
        
        const widget = this.widgets?.find(w => w.name === rect.key);
        if (widget) widget.value = num;
        
        if (this.advancedMode) {
          if (this.overlayInputs[rect.key]) {
            this.overlayInputs[rect.key].value = num;
          }
          if (this.sliderDisplays[rect.key]) {
            this.sliderDisplays[rect.key].textContent = String(num);
          }
        }
        
        popup.remove();
        this.previewImage = null;
        this.setDirtyCanvas(true);
      };
      
      saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); doSave(); };
      input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doSave(); } };
      
      popup.appendChild(input);
      popup.appendChild(saveBtn);
      document.body.appendChild(popup);
      
      const popupWidth = popup.offsetWidth || 180;
      const popupHeight = popup.offsetHeight || 40;
      
      let leftPos = screenX + 15;
      let topPos = screenY - popupHeight / 2;
      
      if (leftPos + popupWidth > window.innerWidth - 10) {
        leftPos = screenX - popupWidth - 15;
      }
      if (topPos < 10) topPos = 10;
      if (topPos + popupHeight > window.innerHeight - 10) {
        topPos = window.innerHeight - popupHeight - 10;
      }
      
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
  }
});