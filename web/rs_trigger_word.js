import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.TriggerWord",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RS_TriggerWord") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;

            const MIN_WIDTH = 210;
            const MIN_HEIGHT = 110;
            const BTN_HEIGHT = 24;
            const GAP = 5;
            const BOTTOM_PAD = 3;

            const DELIMITERS = [
                { value: ". ",  label: "period + space" },
                { value: ", ",  label: "comma + space" },
                { value: ": ",  label: "colon + space" },
                { value: "; ",  label: "semicolon + space" },
                { value: "- ",  label: "dash + space" },
                { value: "_ ",  label: "underscore + space" },
                { value: "> ",  label: "greater + space" },
            ];

            node.setSize([MIN_WIDTH, MIN_HEIGHT]);

            const triggerWidget = node.widgets?.find(w => w.name === "trigger_word");
            const delimiterWidget = node.widgets?.find(w => w.name === "delimiter");

            if (node.widgets) {
                node.widgets.forEach(w => {
                    if (w.name === "trigger_word" || w.name === "delimiter") {
                        w.hidden = true;
                        w.type = "hidden";
                        w.computeSize = () => [0, 0];
                        w.computedHeight = 0;
                        w.draw = function () {};
                        if (w.element && w.element.parentNode) {
                            w.element.parentNode.removeChild(w.element);
                        }
                    }
                });
            }

            const mainContainer = document.createElement("div");
            mainContainer.style.cssText = `
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: ${GAP}px;
                padding: 0 !important;
                margin: 0 !important;
                box-sizing: border-box;
                pointer-events: none;
                position: relative;
            `;

            const customTextArea = document.createElement("textarea");
            customTextArea.value = triggerWidget ? triggerWidget.value : "";
            customTextArea.placeholder = "trigger_word";
            customTextArea.style.cssText = `
                width: 100%;
                min-height: 30px;
                padding: 4px 6px;
                background: #1e1e1e;
                color: #eee;
                border: 1px solid #444;
                border-radius: 4px;
                resize: none;
                font-family: monospace;
                font-size: 12px;
                box-sizing: border-box;
                pointer-events: auto;
                overflow: hidden;
            `;

            customTextArea.addEventListener("input", () => {
                if (triggerWidget) {
                    triggerWidget.value = customTextArea.value;
                }
                node.graph?.setDirtyCanvas(true, true);
            });

            mainContainer.appendChild(customTextArea);

            const currentDelim = delimiterWidget ? delimiterWidget.value : ". ";
            const btnDelimiter = document.createElement("button");
            btnDelimiter.textContent = `DELIMITER (${currentDelim})`;
            btnDelimiter.title = "Choose delimiter";
            btnDelimiter.style.cssText = `
                width: 100%;
                height: ${BTN_HEIGHT}px;
                background: #2a2a2a;
                color: #64B5F6;
                border: 2px solid #2196F3;
                border-radius: 4px;
                cursor: pointer;
                font-weight: normal;
                font-size: 12px;
                transition: all 0.2s;
                pointer-events: auto;
                box-sizing: border-box;
                flex-shrink: 0;
            `;

            btnDelimiter.onmouseover = () => {
                btnDelimiter.style.backgroundColor = "#3a3a3a";
            };
            btnDelimiter.onmouseout = () => {
                btnDelimiter.style.backgroundColor = "#2a2a2a";
            };

            const delimDropdown = document.createElement("div");
            delimDropdown.style.cssText = `
                position: fixed;
                display: none;
                flex-direction: column;
                max-height: 240px;
                overflow-y: auto;
                background: #2a2a2a;
                border: 1px solid #5090cc;
                border-radius: 6px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.8);
                min-width: 260px;
                padding: 5px;
                box-sizing: border-box;
            `;
            document.body.appendChild(delimDropdown);

            const closeDropdown = () => {
                delimDropdown.style.display = "none";
            };

            const buildDropdown = () => {
                delimDropdown.innerHTML = "";
                const activeValue = delimiterWidget ? delimiterWidget.value : ". ";

                DELIMITERS.forEach((item, index) => {
                    const row = document.createElement("div");
                    row.style.cssText = `
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 6px 10px;
                        ${index < DELIMITERS.length - 1 ? "border-bottom: 1px solid #333;" : ""}
                        border-radius: 3px;
                        cursor: pointer;
                    `;

                    const leftPart = document.createElement("span");
                    leftPart.innerHTML = `<span style="color:#64B5F6;font-family:monospace;font-weight:bold;">"${item.value}"</span><span style="color:#888;margin-left:6px;font-size:11px;">- ${item.label}</span>`;
                    leftPart.style.cssText = `
                        flex: 1;
                        color: ${item.value === activeValue ? "#64B5F6" : "#ccc"};
                        font-size: 12px;
                        font-family: monospace;
                        font-weight: ${item.value === activeValue ? "bold" : "normal"};
                    `;

                    const check = document.createElement("span");
                    check.textContent = item.value === activeValue ? "✔" : "";
                    check.style.cssText = "color:#64B5F6;font-size:12px;margin-left:8px;";

                    row.onmouseenter = () => { row.style.background = "#3a3a3a"; };
                    row.onmouseleave = () => { row.style.background = "transparent"; };

                    row.onclick = (e) => {
                        e.stopPropagation();
                        if (delimiterWidget) {
                            delimiterWidget.value = item.value;
                        }
                        btnDelimiter.textContent = `DELIMITER (${item.value})`;
                        node.setDirtyCanvas(true, true);
                        closeDropdown();
                    };

                    row.append(leftPart, check);
                    delimDropdown.appendChild(row);
                });
            };

            const openDropdown = () => {
                buildDropdown();
                const rect = btnDelimiter.getBoundingClientRect();
                delimDropdown.style.left = rect.left + "px";
                delimDropdown.style.width = Math.max(260, rect.width) + "px";
                delimDropdown.style.top = (rect.bottom + 4) + "px";
                delimDropdown.style.bottom = "auto";
                delimDropdown.style.display = "flex";
            };

            btnDelimiter.onclick = (e) => {
                e.stopPropagation();
                if (delimDropdown.style.display === "flex") {
                    closeDropdown();
                } else {
                    openDropdown();
                }
            };

            const outsideClickHandler = (e) => {
                if (!delimDropdown.contains(e.target) && e.target !== btnDelimiter) {
                    closeDropdown();
                }
            };
            document.addEventListener("click", outsideClickHandler);

            mainContainer.appendChild(btnDelimiter);

            const domWidget = node.addDOMWidget("custom_widgets", "customtext", mainContainer);

            node.onResize = function (size) {
                if (size[0] < MIN_WIDTH) size[0] = MIN_WIDTH;
                if (size[1] < MIN_HEIGHT) size[1] = MIN_HEIGHT;

                const titleBarHeight = 30;
                const inputSlotHeight = 10;
                const textareaPadding = 8;

                const fixedHeight = titleBarHeight + inputSlotHeight + GAP + BTN_HEIGHT + BOTTOM_PAD + textareaPadding;
                const textareaHeight = Math.max(30, size[1] - fixedHeight);
                customTextArea.style.height = textareaHeight + 'px';

                const widgetY = size[1] - BTN_HEIGHT - BOTTOM_PAD;
                domWidget.y = widgetY;

                node.setDirtyCanvas(true, true);
            };

            const origOnRemoved = node.onRemoved;
            node.onRemoved = function () {
                document.removeEventListener("click", outsideClickHandler);
                if (delimDropdown.parentNode) {
                    delimDropdown.parentNode.removeChild(delimDropdown);
                }
                if (origOnRemoved) origOnRemoved.apply(this, arguments);
            };

            requestAnimationFrame(() => {
                node.onResize([...node.size]);
            });

            return result;
        };
    },
    setup() {}
});