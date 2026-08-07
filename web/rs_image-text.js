import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.ImageText",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "LoadImageWithText") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;

            node.data = {
                mode: "read",
                prefix: "Civitai/prompt",
                text: "",
                selected_image: ""
            };

            const MIN_WIDTH = 360;
            const MIN_HEIGHT = 520;
            const PREVIEW_FIXED_HEIGHT = 150;

            node.MIN_WIDTH = MIN_WIDTH;
            node.MIN_HEIGHT = MIN_HEIGHT;
            node.setSize([MIN_WIDTH, MIN_HEIGHT]);

            const w_mode = node.widgets?.find(w => w.name === "mode");
            const w_prefix = node.widgets?.find(w => w.name === "filename_prefix");
            const w_text = node.widgets?.find(w => w.name === "text_input");
            const w_image = node.widgets?.find(w => w.name === "image");

            const syncWidget = (widget, dataKey) => {
                if (widget) {
                    widget.value = node.data[dataKey];
                    widget.serializeValue = () => node.data[dataKey];
                }
            };

            if (node.widgets) {
                node.widgets.forEach(w => {
                    if (w.name === "mode" && w.value) node.data.mode = w.value;
                    if (w.name === "filename_prefix" && w.value) node.data.prefix = w.value;
                    if (w.name === "text_input" && w.value) node.data.text = w.value;
                    if (w.name === "image" && w.value) node.data.selected_image = w.value;

                    w.hidden = true;
                    w.type = "hidden";
                    w.computeSize = () => [0, 0];
                    w.computedHeight = 0;
                    w.draw = function () {};

                    if (w.element && w.element.parentNode) {
                        w.element.parentNode.removeChild(w.element);
                    }

                    w.serializeValue = () => {
                        if (w.name === "mode") return node.data.mode;
                        if (w.name === "filename_prefix") return node.data.prefix;
                        if (w.name === "text_input") return node.data.text;
                        if (w.name === "image") return node.data.selected_image;
                        return w.value;
                    };
                });
            }

            node.syncData = function () {
                if (node.graph) {
                    node.graph.setDirtyCanvas(true, true);
                    node.graph.changeTracker?.dispatchEvent(new Event("change"));
                }
            };

            node.imageLoaded = false;
            node.imageLoading = false;

            const mainContainer = document.createElement("div");
            mainContainer.style.cssText = `
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 0 !important;
                margin: 0 !important;
                box-sizing: border-box;
                pointer-events: none;
            `;

            const modeContainer = document.createElement("div");
            modeContainer.style.cssText = "display:flex; gap:8px; width:100%; pointer-events: auto;";

            const createModeBtn = (label, value) => {
                const btn = document.createElement("button");
                btn.textContent = label;
                btn.style.cssText = `flex:1; height:28px; padding:0 12px; border:2px solid #555; border-radius:4px; font-weight:normal; cursor:pointer; transition:all 0.2s; font-size:12px; pointer-events: auto;`;
                btn.onclick = () => {
                    node.data.mode = value;
                    syncWidget(w_mode, 'mode');
                    updateModeVisuals();
                    node.syncData();
                };
                return btn;
            };
            const btnRead = createModeBtn("📄 READ from IMAGE", "read");
            const btnWrite = createModeBtn("✏️ WRITE to IMAGE", "write");
            modeContainer.appendChild(btnRead);
            modeContainer.appendChild(btnWrite);

            const updateModeVisuals = () => {
                const isRead = node.data.mode === "read";
                btnRead.style.backgroundColor = isRead ? "#4CAF50" : "#333";
                btnRead.style.borderColor = isRead ? "#81C784" : "#555";
                btnRead.style.color = isRead ? "#fff" : "#aaa";
                btnWrite.style.backgroundColor = !isRead ? "#2196F3" : "#333";
                btnWrite.style.borderColor = !isRead ? "#64B5F6" : "#555";
                btnWrite.style.color = !isRead ? "#fff" : "#aaa";
            };
            updateModeVisuals();

            const prefixContainer = document.createElement("div");
            prefixContainer.style.cssText = "display:flex; align-items:center; gap:8px; width:100%; pointer-events: auto;";

            const prefixLabel = document.createElement("label");
            prefixLabel.textContent = "PREFIX:";
            prefixLabel.style.cssText = "color:#aaa; font-size:14px; font-weight:normal; white-space:nowrap; pointer-events: auto; cursor:default;";

            const prefixInput = document.createElement("input");
            prefixInput.type = "text";
            prefixInput.value = node.data.prefix;
            prefixInput.style.cssText = "flex:1; height:28px; padding:0 12px; background:#222; color:#eee; border:1px solid #444; border-radius:4px; font-size:14px; box-sizing:border-box; pointer-events: auto;";

            prefixInput.oninput = () => {
                node.data.prefix = prefixInput.value;
                syncWidget(w_prefix, 'prefix');
                node.syncData();
            };

            prefixContainer.appendChild(prefixLabel);
            prefixContainer.appendChild(prefixInput);

            const textContainer = document.createElement("div");
            textContainer.style.cssText = "width:100%; pointer-events: auto;";

            const customTextArea = document.createElement("textarea");
            customTextArea.value = node.data.text;
            customTextArea.placeholder = "Enter text here...";
            customTextArea.style.cssText = "width:100%; min-height:50px; padding:6px; background:#222; color:#eee; border:1px solid #444; border-radius:4px; resize: none; font-family:monospace; font-size:12px; box-sizing:border-box; pointer-events: auto;";

            customTextArea.oninput = () => {
                node.data.text = customTextArea.value;
                syncWidget(w_text, 'text');
                node.syncData();
            };
            textContainer.appendChild(customTextArea);

            const buttonsContainer = document.createElement("div");
            buttonsContainer.style.cssText = "display:flex; gap:8px; width:100%; pointer-events: auto;";

            const btnUpload = document.createElement("button");
            btnUpload.textContent = "📂 UPLOAD IMAGE";
            btnUpload.style.cssText = "flex:1; height:28px; background:#2a2a2a; color:#4CAF50; border:2px solid #4CAF50; border-radius:4px; cursor:pointer; font-weight:normal; font-size:12px; transition:all 0.2s; pointer-events: auto;";
            btnUpload.onmouseover = () => { btnUpload.style.backgroundColor = "#3a3a3a"; };
            btnUpload.onmouseout = () => { btnUpload.style.backgroundColor = "#2a2a2a"; };
            btnUpload.onclick = () => node.triggerFileUpload();

            const btnClear = document.createElement("button");
            btnClear.textContent = "🗑️ CLEAR TEXT";
            btnClear.style.cssText = "flex:1; height:28px; background:#2a2a2a; color:#dc3545; border:2px solid #dc3545; border-radius:4px; cursor:pointer; font-weight:normal; font-size:12px; transition:all 0.2s; pointer-events: auto;";
            btnClear.onmouseover = () => { btnClear.style.backgroundColor = "#3a3a3a"; };
            btnClear.onmouseout = () => { btnClear.style.backgroundColor = "#2a2a2a"; };
            btnClear.onclick = () => {
                node.data.text = "";
                customTextArea.value = "";
                syncWidget(w_text, 'text');
                node.syncData();
            };

            buttonsContainer.appendChild(btnUpload);
            buttonsContainer.appendChild(btnClear);

            const previewWrap = document.createElement("div");
            previewWrap.style.cssText = `
                width: 100%;
                height: ${PREVIEW_FIXED_HEIGHT}px;
                background: #353535;
                border: 1px dashed #555;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                position: relative;
                pointer-events: auto;
                cursor: pointer;
                box-sizing: border-box;
                flex-shrink: 0;
            `;

            const placeholder = document.createElement("div");
            placeholder.textContent = "📁 Drop Image Here or Click to Upload";
            placeholder.style.cssText = "color:#888; font-size:14px; font-family:Arial,sans-serif; text-align:center; pointer-events:none; user-select:none;";
            previewWrap.appendChild(placeholder);

            const previewImg = document.createElement("img");
            previewImg.style.cssText = "display:none; width:100%; height:100%; object-fit:contain; pointer-events:none; user-select:none;";
            previewImg.alt = "Image preview";
            previewWrap.appendChild(previewImg);

            mainContainer.appendChild(modeContainer);
            mainContainer.appendChild(prefixContainer);
            mainContainer.appendChild(textContainer);
            mainContainer.appendChild(buttonsContainer);
            mainContainer.appendChild(previewWrap);

            node.addDOMWidget("custom_widgets", "customtext", mainContainer);
            node.customTextArea = customTextArea;

            const buildViewUrl = (imagePath) => {
                let filename = imagePath;
                let subfolder = "";
                if (imagePath.includes("/")) {
                    const parts = imagePath.split("/");
                    subfolder = parts[0];
                    filename = parts.slice(1).join("/");
                }
                let url = `/view?filename=${encodeURIComponent(filename)}&type=input`;
                if (subfolder) url += `&subfolder=${encodeURIComponent(subfolder)}`;
                return url + `&t=${Date.now()}`;
            };

            let promptRequestId = 0;
            const fetchTextForRead = async (imagePath) => {
                if (node.data.mode !== "read" || !imagePath) return;

                const requestId = ++promptRequestId;

                customTextArea.placeholder = "⏳ Reading text from image...";

                try {
                    const response = await fetch(`/rayko/get_prompt?filename=${encodeURIComponent(imagePath)}`);
                    if (requestId !== promptRequestId) return;
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const result = await response.json();
                    if (requestId !== promptRequestId) return;

                    const text = result.prompt || "";
                    node.data.text = text;
                    customTextArea.value = text;
                    customTextArea.placeholder = text ? "" : "⚠ No text found in this image";
                    syncWidget(w_text, 'text');
                    node.syncData();
                } catch (err) {
                    if (requestId !== promptRequestId) return;
                    customTextArea.placeholder = "⚠ Failed to read text from image";
                    console.error("[RS Image-Text] Fetch text error:", err);
                }
            };

            node.loadImage = function (imagePath) {
                if (!imagePath || node.imageLoading) return;

                node.imageLoading = true;
                node.data.selected_image = imagePath;
                syncWidget(w_image, 'selected_image');

                previewImg.onload = () => {
                    node.imageLoading = false;
                    node.imageLoaded = true;
                    previewImg.style.display = "block";
                    placeholder.style.display = "none";
                    node.syncData();

                    fetchTextForRead(imagePath);
                };
                previewImg.onerror = () => {
                    node.imageLoading = false;
                    node.imageLoaded = false;
                    previewImg.style.display = "none";
                    placeholder.style.display = "block";
                    node.syncData();
                };
                previewImg.src = buildViewUrl(imagePath);
            };

            const uploadFileAndLoad = async (file) => {
                if (!file || !file.type.startsWith('image/')) return false;
                const formData = new FormData();
                formData.append('image', file);
                formData.append('subfolder', '');
                formData.append('type', 'input');

                try {
                    const response = await fetch('/upload/image', { method: 'POST', body: formData });
                    if (response.ok) {
                        const result = await response.json();
                        const imageName = result.name || result.filename;
                        const subfolder = result.subfolder || '';
                        const finalName = subfolder ? `${subfolder}/${imageName}` : imageName;
                        node.loadImage(finalName);
                        return true;
                    }
                } catch (err) {
                    console.error("[RS Image-Text] Upload error:", err);
                }
                return false;
            };

            node.triggerFileUpload = function () {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/png, image/jpeg, image/webp, image/bmp';
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    await uploadFileAndLoad(file);
                    fileInput.remove();
                };
                fileInput.click();
            };

            const onDocumentDragOver = (e) => {
                if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                }
            };
            const onDocumentDrop = (e) => {
                if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                }
            };
            document.addEventListener('dragover', onDocumentDragOver);
            document.addEventListener('drop', onDocumentDrop);
            node._docDragOver = onDocumentDragOver;
            node._docDrop = onDocumentDrop;

            previewWrap.addEventListener('dragover', (e) => {
                if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                e.stopPropagation();
                previewWrap.style.borderColor = '#4CAF50';
                previewWrap.style.backgroundColor = '#2a2a2a';
            });

            previewWrap.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                previewWrap.style.borderColor = '#555';
                previewWrap.style.backgroundColor = '#353535';
            });

            previewWrap.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                previewWrap.style.borderColor = '#555';
                previewWrap.style.backgroundColor = '#353535';

                const file = e.dataTransfer.files[0];
                if (file) {
                    uploadFileAndLoad(file);
                }
            });

            previewWrap.addEventListener('click', () => {
                node.triggerFileUpload();
            });

            node.onSerialize = function (o) {
                syncWidget(w_mode, 'mode');
                syncWidget(w_prefix, 'prefix');
                syncWidget(w_text, 'text');
                syncWidget(w_image, 'selected_image');
                o.data = node.data;
            };

            node.onConfigure = function (o) {
                if (o && o.data) {
                    node.data = { ...node.data, ...o.data };
                }

                node.imageLoading = false;
                node.imageLoaded = false;

                if (node.data.selected_image) {
                    node.loadImage(node.data.selected_image);
                }

                if (prefixInput) prefixInput.value = node.data.prefix || "";
                if (customTextArea) customTextArea.value = node.data.text || "";
                updateModeVisuals();

                syncWidget(w_mode, 'mode');
                syncWidget(w_prefix, 'prefix');
                syncWidget(w_text, 'text');
                syncWidget(w_image, 'selected_image');

                requestAnimationFrame(() => {
                    if (node.size) node.onResize([...node.size]);
                });
            };

            node.visibilityHandler = function () {
                if (!document.hidden && node.graph) {
                    node.graph.setDirtyCanvas(true, true);
                    node.syncData();
                    if (node.size) node.onResize([...node.size]);
                }
            };
            document.addEventListener("visibilitychange", node.visibilityHandler);

            const originalOnResize = node.onResize;
            node.onResize = function (size) {
                if (size[0] < MIN_WIDTH) size[0] = MIN_WIDTH;
                if (size[1] < MIN_HEIGHT) size[1] = MIN_HEIGHT;

                const titleBarHeight = 30;
                const topPadding = 18;
                const gap = 8;
                const bottomPadding = 5;
                const previewSpacing = 35;

                const fixedElements = titleBarHeight + topPadding +
                    28 + gap + 28 + gap +
                    gap + 28 +
                    previewSpacing +
                    PREVIEW_FIXED_HEIGHT +
                    bottomPadding;

                const textareaHeight = Math.max(50, size[1] - fixedElements);

                if (customTextArea) {
                    customTextArea.style.height = textareaHeight + 'px';
                }

                if (originalOnResize) originalOnResize.apply(this, arguments);
                node.setDirtyCanvas(true, true);
            };

            const originalOnRemoved = node.onRemoved;
            node.onRemoved = function () {
                document.removeEventListener("visibilitychange", node.visibilityHandler);
                if (node._docDragOver) document.removeEventListener('dragover', node._docDragOver);
                if (node._docDrop) document.removeEventListener('drop', node._docDrop);
                if (originalOnRemoved) originalOnRemoved.apply(this, arguments);
            };

            node.onDrawBackground = function (ctx) {
                const w = this.size[0];
                const h = this.size[1];
                const radius = 8;
                ctx.beginPath();
                ctx.moveTo(radius, 0);
                ctx.lineTo(w - radius, 0);
                ctx.quadraticCurveTo(w, 0, w, radius);
                ctx.lineTo(w, h - radius);
                ctx.quadraticCurveTo(w, h, w - radius, h);
                ctx.lineTo(radius, h);
                ctx.quadraticCurveTo(0, h, 0, h - radius);
                ctx.lineTo(0, radius);
                ctx.quadraticCurveTo(0, 0, radius, 0);
                ctx.closePath();
                ctx.fillStyle = "#353535";
                ctx.fill();
            };

            node.onDrawForeground = function () {};
            node.onMouseMove = function () {};
            node.onMouseDown = function () { return false; };

            if (node.data.selected_image) {
                node.loadImage(node.data.selected_image);
            }

            requestAnimationFrame(() => {
                node.onResize([MIN_WIDTH, MIN_HEIGHT]);
            });

            return result;
        };
    },
    setup() {}
});