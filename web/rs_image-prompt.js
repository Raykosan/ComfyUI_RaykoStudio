import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.ImagePrompt",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RS_ImagePrompt") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;

            node.data = {
                selected_image: "",
                prompt: ""
            };

            const MIN_WIDTH = 360;
            const MIN_HEIGHT = 460;
            const PREVIEW_FIXED_HEIGHT = 150;

            node.MIN_WIDTH = MIN_WIDTH;
            node.MIN_HEIGHT = MIN_HEIGHT;
            node.setSize([MIN_WIDTH, MIN_HEIGHT]);

            const w_image = node.widgets?.find(w => w.name === "image");
            const w_prompt = node.widgets?.find(w => w.name === "prompt_preview");

            const syncWidget = (widget, dataKey) => {
                if (widget) {
                    widget.value = node.data[dataKey];
                    widget.serializeValue = () => node.data[dataKey];
                }
            };

            if (node.widgets) {
                node.widgets.forEach(w => {
                    if (w.name === "image" && w.value) node.data.selected_image = w.value;
                    if (w.name === "prompt_preview" && w.value) node.data.prompt = w.value;

                    w.hidden = true;
                    w.type = "hidden";
                    w.computeSize = () => [0, 0];
                    w.computedHeight = 0;
                    w.draw = function () {};

                    if (w.element && w.element.parentNode) {
                        w.element.parentNode.removeChild(w.element);
                    }
                });
            }

            syncWidget(w_image, "selected_image");
            syncWidget(w_prompt, "prompt");

            node.syncData = function () {
                if (node.graph) {
                    node.graph.setDirtyCanvas(true, true);
                    node.graph.changeTracker?.dispatchEvent(new Event("change"));
                }
            };

            node.imageLoaded = false;
            node.imageLoading = false;

            let promptRequestId = 0;

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
                position: relative;
            `;

            const toast = document.createElement("div");
            toast.style.cssText = "position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); padding:6px 14px; border-radius:6px; color:#fff; font:bold 14px Arial; z-index:10; pointer-events:none; display:none; white-space:nowrap;";
            mainContainer.appendChild(toast);

            let toastTimer = null;
            node.showToast = function (text, type) {
                let color, borderColor, borderWidth;
                if (type === "success") {
                    color = "rgba(34, 197, 94, 0.97)";
                    borderColor = "rgba(255, 255, 255, 0.95)";
                    borderWidth = 2;
                } else if (type === "warning") {
                    color = "rgba(249, 115, 22, 0.97)";
                    borderColor = "rgba(220, 38, 38, 1)";
                    borderWidth = 3;
                } else {
                    color = "rgba(239, 68, 68, 0.97)";
                    borderColor = "rgba(255, 255, 255, 0.95)";
                    borderWidth = 2;
                }
                toast.textContent = text;
                toast.style.background = color;
                toast.style.border = `${borderWidth}px solid ${borderColor}`;
                toast.style.display = "block";
                if (toastTimer) clearTimeout(toastTimer);
                toastTimer = setTimeout(() => {
                    toast.style.display = "none";
                }, 2000);
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

            const textContainer = document.createElement("div");
            textContainer.style.cssText = "width:100%; pointer-events:auto;";

            const customTextArea = document.createElement("textarea");
            customTextArea.readOnly = true;
            customTextArea.value = node.data.prompt;
            customTextArea.placeholder = "Prompt will appear here after loading an image...";
            customTextArea.style.cssText = "width:100%; min-height:50px; padding:6px; background:#1e1e1e; color:#eee; border:1px solid #444; border-radius:4px; resize:none; font-family:monospace; font-size:12px; box-sizing:border-box; pointer-events:auto; cursor:text;";
            textContainer.appendChild(customTextArea);

            const buttonsContainer = document.createElement("div");
            buttonsContainer.style.cssText = "display:flex; gap:6px; width:100%; pointer-events:auto;";

            const btnUpload = document.createElement("button");
            btnUpload.textContent = "📂 UPLOAD IMAGE";
            btnUpload.style.cssText = "flex:3; height:28px; background:#2a2a2a; color:#4CAF50; border:2px solid #4CAF50; border-radius:4px; cursor:pointer; font-weight:normal; font-size:12px; transition:all 0.2s; pointer-events:auto;";
            btnUpload.onmouseover = () => { btnUpload.style.backgroundColor = "#3a3a3a"; };
            btnUpload.onmouseout = () => { btnUpload.style.backgroundColor = "#2a2a2a"; };
            btnUpload.onclick = () => node.triggerFileUpload();

            const btnCopy = document.createElement("button");
            btnCopy.textContent = "📝 COPY";
            btnCopy.title = "Copy prompt to clipboard";
            btnCopy.style.cssText = "flex:1; height:28px; background:#2a2a2a; color:#64B5F6; border:2px solid #2196F3; border-radius:4px; cursor:pointer; font-weight:normal; font-size:12px; transition:all 0.2s; pointer-events:auto;";
            btnCopy.onmouseover = () => { if (customTextArea.value) btnCopy.style.backgroundColor = "#3a3a3a"; };
            btnCopy.onmouseout = () => { btnCopy.style.backgroundColor = "#2a2a2a"; };
            btnCopy.onclick = () => copyPrompt();

            buttonsContainer.appendChild(btnUpload);
            buttonsContainer.appendChild(btnCopy);

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
            `;

            const placeholder = document.createElement("div");
            placeholder.textContent = "📁 Drop Image Here or Click to Upload";
            placeholder.style.cssText = "color:#888; font-size:14px; font-family:Arial,sans-serif; text-align:center; pointer-events:none; user-select:none;";
            previewWrap.appendChild(placeholder);

            const previewImg = document.createElement("img");
            previewImg.style.cssText = "display:none; width:100%; height:100%; object-fit:contain; pointer-events:none; user-select:none;";
            previewImg.alt = "Image preview";
            previewWrap.appendChild(previewImg);

            mainContainer.appendChild(textContainer);
            mainContainer.appendChild(buttonsContainer);
            mainContainer.appendChild(previewWrap);

            const copyPrompt = async () => {
                const text = customTextArea.value;
                if (!text) return;

                if (navigator.clipboard && window.isSecureContext) {
                    try {
                        await navigator.clipboard.writeText(text);
                        node.showToast("Copy done!", "success");
                        return;
                    } catch (e) { }
                }

                try {
                    customTextArea.focus();
                    customTextArea.select();
                    const ok = document.execCommand("copy");
                    customTextArea.setSelectionRange(0, 0);
                    customTextArea.blur();
                    if (ok) node.showToast("Copy done!", "success");
                    else node.showToast("Copy error!", "error");
                } catch (e) {
                    node.showToast("Copy error!", "error");
                }
            };

            const updateCopyBtnState = () => {
                if (!btnCopy) return;
                const has = !!customTextArea.value;
                btnCopy.style.opacity = has ? "1" : "0.4";
                btnCopy.style.cursor = has ? "pointer" : "not-allowed";
            };

            const fetchPrompt = async (imagePath, notifyNotFound) => {
                if (!imagePath) return;

                const requestId = ++promptRequestId;

                node.data.prompt = "";
                customTextArea.value = "";
                customTextArea.placeholder = "⏳ Loading prompt...";
                syncWidget(w_prompt, "prompt");
                updateCopyBtnState();
                node.syncData();

                try {
                    const response = await fetch(`/rayko/get_prompt?filename=${encodeURIComponent(imagePath)}`);

                    if (requestId !== promptRequestId) return;

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const result = await response.json();

                    if (requestId !== promptRequestId) return;

                    node.data.prompt = result.prompt || "";
                    customTextArea.value = node.data.prompt;
                    customTextArea.placeholder = node.data.prompt
                        ? ""
                        : "⚠ Prompt not found in this image";
                    syncWidget(w_prompt, "prompt");
                    updateCopyBtnState();
                    node.syncData();

                    if (!node.data.prompt && notifyNotFound) {
                        node.showToast("⚠ Prompt not found", "warning");
                    }
                } catch (err) {
                    if (requestId !== promptRequestId) return;
                    customTextArea.placeholder = "⚠ Prompt not found in this image";
                }
            };

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

            node.loadImage = function (imagePath, notifyNotFound) {
                if (!imagePath || node.imageLoading) return;

                node.imageLoading = true;
                node.data.selected_image = imagePath;
                syncWidget(w_image, "selected_image");

                previewImg.onload = () => {
                    node.imageLoading = false;
                    node.imageLoaded = true;
                    previewImg.style.display = "block";
                    placeholder.style.display = "none";
                    node.syncData();
                    fetchPrompt(imagePath, notifyNotFound);
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
                if (!file) return false;

                const SUPPORTED_EXT = /\.(png|jpe?g|webp)$/i;
                const SUPPORTED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
                const isSupported = SUPPORTED_EXT.test(file.name) || SUPPORTED_MIME.includes(file.type);

                if (!isSupported) {
                    node.showToast("⚠ Only PNG/JPG/WebP supported", "warning");
                    return false;
                }

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
                        node.loadImage(finalName, true);
                        return true;
                    }
                } catch (err) {
                    console.error("[RS Image-Prompt] Upload error:", err);
                }
                return false;
            };

            node.triggerFileUpload = function () {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/png,image/jpeg,image/webp';
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    await uploadFileAndLoad(file);
                    fileInput.remove();
                };
                fileInput.click();
            };

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

            node.addDOMWidget("custom_widgets", "customtext", mainContainer);
            node.customTextArea = customTextArea;

            const updateUIFromData = () => {
                customTextArea.value = node.data.prompt || "";
                updateCopyBtnState();
            };

            node.onSerialize = function (o) {
                syncWidget(w_image, "selected_image");
                syncWidget(w_prompt, "prompt");
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

                updateUIFromData();

                syncWidget(w_image, "selected_image");
                syncWidget(w_prompt, "prompt");

                requestAnimationFrame(() => {
                    if (node.size) {
                        node.onResize([...node.size]);
                    }
                });
            };

            node.visibilityHandler = function () {
                if (!document.hidden && node.graph) {
                    node.graph.setDirtyCanvas(true, true);
                    node.syncData();

                    if (node.size) {
                        node.onResize([...node.size]);
                    }
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
                const bottomPadding = 0;
                const previewSpacing = 20;

                const fixedElements = titleBarHeight + topPadding +
                    28 + gap +
                    previewSpacing +
                    PREVIEW_FIXED_HEIGHT +
                    bottomPadding;

                const textareaHeight = Math.max(50, size[1] - fixedElements);
                customTextArea.style.height = textareaHeight + 'px';

                if (originalOnResize) originalOnResize.apply(this, arguments);
                node.setDirtyCanvas(true, true);
            };

            const originalOnRemoved = node.onRemoved;
            node.onRemoved = function () {
                document.removeEventListener("visibilitychange", node.visibilityHandler);
                if (node._docDragOver) {
                    document.removeEventListener('dragover', node._docDragOver);
                }
                if (node._docDrop) {
                    document.removeEventListener('drop', node._docDrop);
                }
                if (originalOnRemoved) originalOnRemoved.apply(this, arguments);
            };

            if (node.data.selected_image) {
                node.loadImage(node.data.selected_image);
            }

            updateCopyBtnState();

            requestAnimationFrame(() => {
                node.onResize([...node.size]);
            });

            return result;
        };
    },
    setup() {}
});