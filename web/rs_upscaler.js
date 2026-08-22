import { app } from "../../scripts/app.js";

const RS_UPSCALER_NODE_TYPE = "RSUpscaler";
const DEFAULT_SCALE = 2.0;
const SCALE_MIN = 0.1;
const SCALE_MAX = 8.0;
const SCALE_STEP = 0.05;
const NODE_WIDTH = 300;
const NODE_HEIGHT = 130;

function getScopedStyles(scopeId) {
    return `
        /* === Container === */
        .${scopeId} .rs-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }
        .${scopeId} .rs-row label {
            flex-shrink: 0;
            font-size: 11px;
            color: #aaa;
            white-space: nowrap;
            min-width: 40px;
            font-family: sans-serif;
        }
        .${scopeId} .rs-row select {
            flex: 1;
            min-width: 0;
            background: #222;
            color: #fff;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 5px 8px;
            font-size: 11px;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
            appearance: auto;
            font-family: sans-serif;
        }
        .${scopeId} .rs-row select:hover { border-color: #ff9800; }
        .${scopeId} .rs-row select:focus { border-color: #ff9800; box-shadow: 0 0 0 1px rgba(255,152,0,0.3); }

        /* === Slider row === */
        .${scopeId} .rs-slider-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }
        .${scopeId} .rs-slider-row label {
            flex-shrink: 0;
            font-size: 11px;
            color: #aaa;
            white-space: nowrap;
            min-width: 40px;
            font-family: sans-serif;
        }

        /* Slider: green fill + white handle */
        .${scopeId} .rs-slider-row input[type="range"] {
            flex: 1;
            min-width: 0;
            height: 4px;
            border-radius: 2px;
            outline: none;
            cursor: pointer;
            -webkit-appearance: none;
            appearance: none;
            background: linear-gradient(to right,
                #4CAF50 0%, #4CAF50 var(--rs-fill, 25%),
                #444 var(--rs-fill, 25%), #444 100%);
        }
        .${scopeId} .rs-slider-row input[type="range"]::-webkit-slider-runnable-track {
            height: 4px;
            background: transparent;
            border-radius: 2px;
        }
        .${scopeId} .rs-slider-row input[type="range"]::-moz-range-track {
            height: 4px;
            background: transparent;
            border-radius: 2px;
        }
        .${scopeId} .rs-slider-row input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #fff;
            border: none;
            cursor: pointer;
            margin-top: -4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        .${scopeId} .rs-slider-row input[type="range"]::-moz-range-thumb {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #fff;
            border: none;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }

        /* === Step buttons +/- === */
        .${scopeId} .rs-step-btn {
            width: 20px;
            height: 26px;
            background: #252525;
            color: #888;
            border: 1px solid #444;
            border-radius: 4px;
            cursor: pointer;
            font-size: 9px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: 0.15s;
            flex-shrink: 0;
            user-select: none;
            line-height: 1;
            padding: 0;
        }
        .${scopeId} .rs-step-btn:hover {
            background: #2a2a2a;
            color: #fff;
            border-color: #ff9800;
        }
        .${scopeId} .rs-step-btn:active {
            background: #333;
        }

        /* === Value input === */
        .${scopeId} .rs-value-input {
            width: 35px;
            min-width: 35px;
            max-width: 35px;
            height: 26px;
            text-align: center;
            background: #252525;
            color: #4CAF50;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 0;
            font-size: 11px;
            cursor: pointer;
            font-weight: 600;
            transition: 0.15s;
            font-family: sans-serif;
            font-variant-numeric: tabular-nums;
            flex-shrink: 0;
            overflow: hidden;
            white-space: nowrap;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }
        .${scopeId} .rs-value-input:hover {
            border-color: #ff9800;
            color: #fff;
        }
    `;
}

const POPUP_STYLES = `
    .rs-value-popup {
        position: fixed;
        z-index: 10004;
        background: #1a1a1a;
        border: 1px solid #444;
        border-radius: 6px;
        padding: 8px 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .rs-value-popup input[type="number"] {
        width: 80px;
        background: #222;
        color: #fff;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 12px;
        outline: none;
        font-family: sans-serif;
        text-align: center;
        -webkit-appearance: auto !important;
        -moz-appearance: auto !important;
        appearance: auto !important;
    }
    .rs-value-popup input[type="number"]:focus {
        border-color: #ff9800;
    }
    /* Force spinner arrows visible in Chrome/Edge */
    .rs-value-popup input[type="number"]::-webkit-inner-spin-button,
    .rs-value-popup input[type="number"]::-webkit-outer-spin-button {
        -webkit-appearance: inner-spin-button !important;
        opacity: 1 !important;
        height: 28px;
    }
    /* Firefox */
    .rs-value-popup input[type="number"] {
        -moz-appearance: auto !important;
    }
    .rs-value-popup button {
        background: #4CAF50;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        font-family: sans-serif;
    }
    .rs-value-popup button:hover {
        background: #43A047;
    }
`;

let popupStylesInjected = false;
function injectPopupStyles() {
    if (popupStylesInjected) return;
    const style = document.createElement("style");
    style.textContent = POPUP_STYLES;
    document.head.appendChild(style);
    popupStylesInjected = true;
}

let upscaleModelsCache = null;
async function fetchUpscaleModels() {
    if (upscaleModelsCache) return upscaleModelsCache;
    try {
        const resp = await fetch("/api/object_info/RSUpscaler");
        const data = await resp.json();
        upscaleModelsCache = data.RSUpscaler.input.required.upscale_model[0];
    } catch (e) {
        console.warn("[RS Upscaler] Failed to fetch models list:", e);
        upscaleModelsCache = [];
    }
    return upscaleModelsCache;
}

function clampScale(v) {
    return Math.max(SCALE_MIN, Math.min(SCALE_MAX, v));
}

function formatScale(v) {
    return parseFloat(v).toFixed(2);
}

app.registerExtension({
    name: "RaykoStudio.RSUpscaler",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== RS_UPSCALER_NODE_TYPE) return;

        injectPopupStyles();

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            const scopeId = `rs-upscaler-${this.id}`;

            if (!document.getElementById(`style-${scopeId}`)) {
                const style = document.createElement("style");
                style.id = `style-${scopeId}`;
                style.textContent = getScopedStyles(scopeId);
                document.head.appendChild(style);
            }

            this.setSize([NODE_WIDTH, NODE_HEIGHT]);

            this.onResize = function (size) {
                if (size[0] < NODE_WIDTH) size[0] = NODE_WIDTH;
                if (size[1] < NODE_HEIGHT) size[1] = NODE_HEIGHT;
            };

            const widgetsToHide = ["upscale_model", "upscale_method", "upscale_x"];
            this.widgets.forEach((w) => {
                if (widgetsToHide.includes(w.name)) {
                    w.hidden = true;
                    w.tooltip = "";
                    w.type = "hidden";
                    if (w.element) {
                        w.element.style.display = "none";
                        w.element.style.pointerEvents = "none";
                    }
                    w.computeSize = () => [0, 0];
                }
            });

            const container = document.createElement("div");
            container.className = scopeId;

            const row1 = document.createElement("div");
            row1.className = "rs-row";
            const modelLabel = document.createElement("label");
            modelLabel.textContent = "Model";
            row1.appendChild(modelLabel);
            const modelSelect = document.createElement("select");
            row1.appendChild(modelSelect);
            container.appendChild(row1);

            fetchUpscaleModels().then((models) => {
                models.forEach((m) => {
                    const opt = document.createElement("option");
                    opt.value = m;
                    opt.textContent = m.replace(/\.(pth|bin|pt|safetensors)$/i, "");
                    modelSelect.appendChild(opt);
                });
                const currentModel = this.widgets.find((w) => w.name === "upscale_model")?.value;
                if (currentModel) modelSelect.value = currentModel;
            });

            const row2 = document.createElement("div");
            row2.className = "rs-row";
            const methodLabel = document.createElement("label");
            methodLabel.textContent = "Method";
            row2.appendChild(methodLabel);
            const methodSelect = document.createElement("select");
            const methods = ["nearest-exact", "bilinear", "area", "bicubic", "lanczos"];
            methods.forEach((m) => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
                methodSelect.appendChild(opt);
            });
            row2.appendChild(methodSelect);
            container.appendChild(row2);

            const row3 = document.createElement("div");
            row3.className = "rs-slider-row";

            const sliderLabel = document.createElement("label");
            sliderLabel.textContent = "Scale";
            row3.appendChild(sliderLabel);

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = String(SCALE_MIN);
            slider.max = String(SCALE_MAX);
            slider.step = String(SCALE_STEP);
            slider.value = String(DEFAULT_SCALE);
            row3.appendChild(slider);

            const minusBtn = document.createElement("button");
            minusBtn.className = "rs-step-btn";
            minusBtn.textContent = "◀";
            minusBtn.title = "Decrease by " + SCALE_STEP;
            row3.appendChild(minusBtn);

            const valueDisplay = document.createElement("div");
            valueDisplay.className = "rs-value-input";
            valueDisplay.textContent = formatScale(DEFAULT_SCALE);
            row3.appendChild(valueDisplay);

            const plusBtn = document.createElement("button");
            plusBtn.className = "rs-step-btn";
            plusBtn.textContent = "▶";
            plusBtn.title = "Increase by " + SCALE_STEP;
            row3.appendChild(plusBtn);

            container.appendChild(row3);

            const updateFill = () => {
                const pct = ((parseFloat(slider.value) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
                slider.style.setProperty("--rs-fill", pct + "%");
            };

            const setValue = (rawVal) => {
                const v = clampScale(Math.round(parseFloat(rawVal) / SCALE_STEP) * SCALE_STEP);
                slider.value = String(v);
                valueDisplay.textContent = formatScale(v);
                updateFill();
                syncToNative();
            };

            const updateFromSlider = () => {
                valueDisplay.textContent = formatScale(slider.value);
                updateFill();
                syncToNative();
            };

            slider.addEventListener("input", updateFromSlider);
            slider.addEventListener("change", updateFromSlider);

            minusBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                setValue(parseFloat(slider.value) - SCALE_STEP);
            });

            plusBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                setValue(parseFloat(slider.value) + SCALE_STEP);
            });

            valueDisplay.addEventListener("click", (e) => {
                e.stopPropagation();

                const existingPopup = document.querySelector(".rs-value-popup");
                if (existingPopup) existingPopup.remove();

                const popup = document.createElement("div");
                popup.className = "rs-value-popup";

                const input = document.createElement("input");
                input.type = "number";
                input.value = parseFloat(slider.value).toFixed(2);
                input.min = String(SCALE_MIN);
                input.max = String(SCALE_MAX);
                input.step = String(SCALE_STEP);
                input.style.cssText = [
                    "width: 80px",
                    "background: #222",
                    "color: #fff",
                    "border: 1px solid #444",
                    "border-radius: 4px",
                    "padding: 6px 10px",
                    "font-size: 12px",
                    "outline: none",
                    "font-family: sans-serif",
                    "text-align: center",
                    "-webkit-appearance: auto",
                    "-moz-appearance: auto",
                    "appearance: auto",
                ].join(";") + ";";

                const saveBtn = document.createElement("button");
                saveBtn.textContent = "OK";

                const doSave = () => {
                    let num = parseFloat(input.value);
                    if (isNaN(num)) num = DEFAULT_SCALE;
                    setValue(num);
                    popup.remove();
                };

                saveBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); doSave(); };
                input.onkeydown = (ev) => {
                    if (ev.key === "Enter") { ev.preventDefault(); doSave(); }
                    if (ev.key === "Escape") { popup.remove(); }
                };

                popup.appendChild(input);
                popup.appendChild(saveBtn);
                document.body.appendChild(popup);

                const rect = valueDisplay.getBoundingClientRect();
                const popupWidth = popup.offsetWidth || 160;
                const popupHeight = popup.offsetHeight || 40;
                let leftPos = rect.right + 8;
                let topPos = rect.top + (rect.height - popupHeight) / 2;

                if (leftPos + popupWidth > window.innerWidth - 10) {
                    leftPos = rect.left - popupWidth - 8;
                }
                if (topPos < 10) topPos = 10;
                if (topPos + popupHeight > window.innerHeight - 10) {
                    topPos = window.innerHeight - popupHeight - 10;
                }

                popup.style.left = leftPos + "px";
                popup.style.top = topPos + "px";

                setTimeout(() => { input.focus(); input.select(); }, 50);

                setTimeout(() => {
                    const closeHandler = (ev) => {
                        if (!popup.contains(ev.target)) {
                            popup.remove();
                            document.removeEventListener("mousedown", closeHandler);
                        }
                    };
                    document.addEventListener("mousedown", closeHandler);
                }, 100);
            });

            this.addDOMWidget("rs_custom_widgets", "div", container);

            const syncToNative = () => {
                const mw = this.widgets.find((w) => w.name === "upscale_model");
                const mtw = this.widgets.find((w) => w.name === "upscale_method");
                const xw = this.widgets.find((w) => w.name === "upscale_x");
                if (mw) mw.value = modelSelect.value;
                if (mtw) mtw.value = methodSelect.value;
                if (xw) xw.value = parseFloat(slider.value);
                this.graph?.setDirtyCanvas(true, true);
            };

            modelSelect.addEventListener("change", syncToNative);
            methodSelect.addEventListener("change", syncToNative);

            setTimeout(() => {
                syncToNative();
                updateFill();
            }, 100);

            const onConfigure = this.onConfigure;
            this.onConfigure = function (info) {
                const r = onConfigure?.apply(this, arguments);
                setTimeout(() => {
                    const mw = this.widgets.find((w) => w.name === "upscale_model");
                    const mtw = this.widgets.find((w) => w.name === "upscale_method");
                    const xw = this.widgets.find((w) => w.name === "upscale_x");
                    if (mw?.value) modelSelect.value = mw.value;
                    if (mtw?.value) methodSelect.value = mtw.value;
                    if (xw?.value != null) {
                        const v = clampScale(parseFloat(xw.value));
                        slider.value = String(v);
                        valueDisplay.textContent = formatScale(v);
                    } else {
                        slider.value = String(DEFAULT_SCALE);
                        valueDisplay.textContent = formatScale(DEFAULT_SCALE);
                    }
                    updateFill();
                    syncToNative();
                }, 50);
                return r;
            };

            const onRemoved = this.onRemoved;
            this.onRemoved = function () {
                const styleEl = document.getElementById(`style-${scopeId}`);
                if (styleEl) styleEl.remove();
                if (onRemoved) onRemoved.apply(this, arguments);
            };

            return result;
        };
    },
});