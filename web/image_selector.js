import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RaykoStudio.ImageSelector",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RS Image Selector") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            this.images = [];
            this.selectedIndices = new Set();
            this.imagePaths = [];
            this.userResized = false;
            this.heartbeatInterval = null;

            this.setSize([450, 500]);

            this.buttons = [
                { label: "➕ SELECT ALL", key: "select_all", color: "#2196F3", hover: false, row: 0, col: 0 },
                { label: "✔️ ACCEPT", key: "accept", color: "#4CAF50", hover: false, row: 0, col: 1 },
                { label: "⭕ DESELECT ALL", key: "deselect_all", color: "#9E9E9E", hover: false, row: 1, col: 0 },
                { label: "❌ CANCEL", key: "cancel", color: "#dc3545", hover: false, row: 1, col: 1 }
            ];

            this.onVisibilityChange = () => {
                if (document.visibilityState === "visible") {
                    this.setDirtyCanvas(true);
                }
            };
            document.addEventListener("visibilitychange", this.onVisibilityChange);
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (onRemoved) onRemoved.apply(this, arguments);
            if (this.onVisibilityChange) {
                document.removeEventListener("visibilitychange", this.onVisibilityChange);
            }
            
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            
            console.log(`[ImSELECT 🦊] Node ${this.id} removed, sending cleanup signal...`);
            fetch("/rayko/imselect/cleanup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node_id: String(this.id) })
            }).catch(err => {
                console.error("[ImSELECT 🦊] Cleanup signal failed: ", err);
            });
        };

        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function(size) {
            if (onResize) onResize.apply(this, arguments);
            this.userResized = true;
        };

        nodeType.prototype.startHeartbeat = function() {
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = setInterval(async () => {
                try {
                    await api.fetchApi("/rayko/imselect/heartbeat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ node_id: String(this.id) })
                    });
                } catch (e) {
                    console.log("[ImSELECT 🦊] Heartbeat failed");
                }
            }, 5000);
        };

        nodeType.prototype.stopHeartbeat = function() {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
        };

        nodeType.prototype.autoSize = function(imageCount) {
            const CONFIG = {
                minImageSize: 120,
                maxImageSize: 200,
                targetImageSize: 150,
                minCols: 2,
                maxCols: 6,
                margin: 12,
                topBarH: 10,
                bottomBarH: 85,
                minWidth: 400,
                maxWidth: 1200,
                minHeight: 300,
                maxHeight: 900
            };

            let cols = Math.ceil(Math.sqrt(imageCount * (CONFIG.targetImageSize / CONFIG.targetImageSize)));
            cols = Math.max(CONFIG.minCols, Math.min(CONFIG.maxCols, cols));

            if (imageCount <= 2) cols = 2;
            else if (imageCount <= 6) cols = 3;
            else if (imageCount <= 12) cols = 4;
            else if (imageCount <= 20) cols = 5;
            else cols = 6;

            const rows = Math.ceil(imageCount / cols);

            const contentWidth = (cols * CONFIG.targetImageSize) + ((cols - 1) * CONFIG.margin);
            const contentHeight = (rows * CONFIG.targetImageSize) + ((rows - 1) * CONFIG.margin);

            const targetWidth = Math.max(CONFIG.minWidth, Math.min(CONFIG.maxWidth, contentWidth + (CONFIG.margin * 2)));
            const targetHeight = Math.max(CONFIG.minHeight, Math.min(CONFIG.maxHeight, 
                contentHeight + CONFIG.topBarH + CONFIG.bottomBarH));

            const shouldResize = 
                this.size[0] < targetWidth - 50 || 
                this.size[1] < targetHeight - 50;

            if (shouldResize && !this.userResized) {
                this.setSize([
                    Math.max(this.size[0], targetWidth),
                    Math.max(this.size[1], targetHeight)
                ]);
            }

            return { cols, rows, targetWidth, targetHeight };
        };

        nodeType.prototype.getNodeScreenPosition = function() {
            const canvasEl = app.canvas?.canvas || document.querySelector('canvas');
            if (!canvasEl || !this.pos) {
                return { x: 250, y: 200 };
            }
            
            const canvasRect = canvasEl.getBoundingClientRect();
            const ds = app.canvas.ds;
            
            return {
                x: canvasRect.left + ((this.pos[0] + ds.offset[0]) * ds.scale),
                y: canvasRect.top + ((this.pos[1] + ds.offset[1]) * ds.scale)
            };
        };

        nodeType.prototype.showWarningPopup = function() {
            const existingPopup = document.querySelector('.imselect-warning-popup');
            if (existingPopup) existingPopup.remove();
            
            const popup = document.createElement('div');
            popup.className = 'imselect-warning-popup';
            popup.style.cssText = `
                position: fixed;
                background: #1a1a1a;
                border: 2px solid #dc3545;
                border-radius: 8px;
                padding: 20px;
                z-index: 10001;
                box-shadow: 0 4px 30px rgba(0,0,0,0.7);
                max-width: 450px;
                font-family: 'Segoe UI', Roboto, sans-serif;
            `;
            
            const nodeScreenPos = this.getNodeScreenPosition();
            popup.style.left = (nodeScreenPos.x + 50) + 'px';
            popup.style.top = (nodeScreenPos.y + 100) + 'px';
            
            popup.innerHTML = `
                <div style="color: #dc3545; font-size: 16px; font-weight: bold; margin-bottom: 15px; text-align: center;">
                    ⚠️ WARNING / ВНИМАНИЕ
                </div>
                <div style="color: #fff; font-size: 13px; margin-bottom: 12px; line-height: 1.5; border-bottom: 1px solid #333; padding-bottom: 12px;">
                    No images selected.<br>
                    Please select at least one image, or press 
                    <span style="color: #dc3545; font-weight: bold;">❌ CANCEL</span>
                </div>
                <div style="color: #fff; font-size: 13px; margin-bottom: 15px; line-height: 1.5;">
                    Не выбрано ни одно изображение.<br>
                    Выберите хотя бы одно изображение,<br>или нажмите кнопку 
                    <span style="color: #dc3545; font-weight: bold;">❌ CANCEL</span>
                </div>
                <button id="imselect-warning-ok" style="
                    background: #2a2a2a;
                    color: #fff;
                    border: 1px solid #555;
                    padding: 8px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    width: 100%;
                ">OK / ПОНЯТНО</button>
            `;
            
            document.body.appendChild(popup);
            
            document.getElementById('imselect-warning-ok').addEventListener('click', () => {
                popup.remove();
            });
            
            setTimeout(() => {
                const closeHandler = (e) => {
                    if (!popup.contains(e.target)) {
                        popup.remove();
                        document.removeEventListener('mousedown', closeHandler);
                    }
                };
                document.addEventListener('mousedown', closeHandler);
            }, 100);
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);

            if (!this.imagePaths.length) {
                ctx.fillStyle = "#888";
                ctx.font = "italic 13px 'Segoe UI', Roboto, sans-serif";
                ctx.textAlign = "center";
                
                const titleBarHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
                const padding = 10;
                const footerHeight = 70;
                let widgetsTotalHeight = 0;
                
                if (this.widgets) {
                    for (const w of this.widgets) {
                        if (!w.hidden && w.type !== "button") {
                            widgetsTotalHeight += (w.computeSize ? w.computeSize(this.size[0])[1] : 20);
                        }
                    }
                }
                
                const startY = titleBarHeight + widgetsTotalHeight + padding;
                const availableHeight = this.size[1] - startY - footerHeight - padding;
                
                ctx.fillText("Ready for images...", this.size[0] / 2, startY + availableHeight / 2);
                return;
            }

            const titleBarHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
            const padding = 10;
            const footerHeight = 70;
            const btnH = 28;
            const btnGap = 5;
            const btnY = this.size[1] - 65;
            
            let widgetsTotalHeight = 0;
            if (this.widgets) {
                for (const w of this.widgets) {
                    if (!w.hidden && w.type !== "button") {
                        widgetsTotalHeight += (w.computeSize ? w.computeSize(this.size[0])[1] : 20);
                    }
                }
            }
            
            const startY = titleBarHeight + widgetsTotalHeight + padding;
            const availableHeight = this.size[1] - startY - footerHeight - padding;
            const availableWidth = this.size[0] - (padding * 2);
            
            const contentX = padding;
            const contentY = startY;
            const contentW = availableWidth;
            const contentH = availableHeight;

            const count = this.imagePaths.length;
            const approxSide = Math.sqrt((contentW * contentH) / count);
            let cols = Math.floor(contentW / approxSide);
            if (cols < 1) cols = 1;
            const rows = Math.ceil(count / cols);

            const margin = 12;
            const cellW = (contentW - (margin * (cols - 1))) / cols;
            const cellH = (contentH - (margin * (rows - 1))) / rows;

            this.imageRects = [];

            try {
                this.imagePaths.forEach((path, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);

                    const x = contentX + (col * (cellW + margin));
                    const y = contentY + (row * (cellH + margin));

                    this.imageRects.push({ i, x, y, w: cellW, h: cellH });

                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(x, y, cellW, cellH, 6);
                    ctx.clip();

                    ctx.fillStyle = "#151515";
                    ctx.fillRect(x, y, cellW, cellH);

                    const img = this.images[i];
                    if (img && img.complete && img.width > 0) {
                        const imgRatio = img.width / img.height;
                        const cellRatio = cellW / cellH;
                        let dx, dy, dw, dh;

                        if (imgRatio > cellRatio) {
                            dw = cellW;
                            dh = cellW / imgRatio;
                            dx = x;
                            dy = y + (cellH - dh) / 2;
                        } else {
                            dh = cellH;
                            dw = cellH * imgRatio;
                            dy = y;
                            dx = x + (cellW - dw) / 2;
                        }
                        ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
                    } else if (img && img.broken) {
                        ctx.fillStyle = "#331111";
                        ctx.fillRect(x, y, cellW, cellH);
                        ctx.fillStyle = "#cc5555";
                        ctx.font = "10px Arial";
                        ctx.textAlign = "center";
                        ctx.fillText("Error", x + cellW / 2, y + cellH / 2);
                    }
                    ctx.restore();

                    if (this.selectedIndices.has(i)) {
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = "#e0e0e0";
                        ctx.strokeRect(x, y, cellW, cellH);

                        const badgeSize = 20;
                        const bx = x + cellW - badgeSize - 6;
                        const by = y + 6;

                        ctx.beginPath();
                        ctx.roundRect(bx, by, badgeSize, badgeSize, 4);
                        ctx.fillStyle = "#e0e0e0";
                        ctx.fill();

                        ctx.fillStyle = "#111";
                        ctx.font = "bold 12px Arial";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText("✓", bx + badgeSize / 2, by + badgeSize / 2 + 1);
                    }
                });
            } catch (error) {
                console.error("Batch Selector: Error rendering images", error);
                ctx.fillStyle = "red";
                ctx.font = "12px Arial";
                ctx.fillText("Render Error", 10, 10);
            }

            const totalBtnW = this.size[0] - 50;
            const btnW = (totalBtnW - btnGap) / 2;

            this.btnRects = [];

            this.buttons.forEach((btn, i) => {
                const col = btn.col;
                const row = btn.row;
                const x = 15 + (col * (btnW + btnGap));
                const y = btnY + (row * (btnH + btnGap));
                
                this.btnRects.push({ 
                    key: btn.key,
                    x: x, 
                    y: y, 
                    w: btnW, 
                    h: btnH 
                });

                ctx.fillStyle = btn.hover ? "#444" : "#2a2a2a";
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(x, y, btnW, btnH, 6);
                } else {
                    ctx.rect(x, y, btnW, btnH);
                }
                ctx.fill();

                ctx.lineWidth = 1;
                ctx.strokeStyle = btn.color;
                ctx.stroke();

                ctx.fillStyle = btn.color;
                ctx.font = "bold 11px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(btn.label, x + btnW / 2, y + btnH / 2);

                if (btn.hover && app.canvas.canvas) {
                    app.canvas.canvas.style.cursor = "pointer";
                }
            });
        };

        const onMouseDown = nodeType.prototype.onMouseDown;
        nodeType.prototype.onMouseDown = function (event, pos, graphPos) {
            if (onMouseDown) onMouseDown.apply(this, arguments);
            const x = pos[0];
            const y = pos[1];

            if (this.imageRects) {
                for (const r of this.imageRects) {
                    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                        if (this.selectedIndices.has(r.i)) this.selectedIndices.delete(r.i);
                        else this.selectedIndices.add(r.i);
                        this.setDirtyCanvas(true);
                        return true;
                    }
                }
            }
            if (this.btnRects) {
                for (const b of this.btnRects) {
                    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                        this.handleButtonClick(b.key);
                        return true;
                    }
                }
            }
        };

        const onMouseMove = nodeType.prototype.onMouseMove;
        nodeType.prototype.onMouseMove = function (event, pos, graphPos) {
            if (onMouseMove) onMouseMove.apply(this, arguments);
            const x = pos[0];
            const y = pos[1];
            let needsRedraw = false;

            if (this.btnRects) {
                for (let i = 0; i < this.btnRects.length; i++) {
                    const b = this.btnRects[i];
                    const isOver = x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
                    if (this.buttons[i].hover !== isOver) {
                        this.buttons[i].hover = isOver;
                        needsRedraw = true;
                    }
                }
            }
            if (needsRedraw) this.setDirtyCanvas(true);
        };

        nodeType.prototype.handleButtonClick = async function (key) {
            if (key === 'select_all') {
                this.imagePaths.forEach((_, i) => this.selectedIndices.add(i));
            } else if (key === 'deselect_all') {
                this.selectedIndices.clear();
            } else if (key === 'accept') {
                if (this.selectedIndices.size === 0) {
                    this.showWarningPopup();
                    return;
                }
                const sorted = Array.from(this.selectedIndices).sort((a, b) => a - b);
                this.sendSelection(sorted);
            } else if (key === 'cancel') {
                try { await api.interrupt(); } catch (e) { }
                this.sendSelection([]);
            }
            this.setDirtyCanvas(true);
        };

        nodeType.prototype.sendSelection = async function (indices) {
            try {
                const response = await api.fetchApi("/rayko/image_selector", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: String(this.id), selection: indices })
                });
                
                if (response.ok) {
                    console.log(`[ImSELECT 🦊] Selection sent for node ${this.id}`);
                    this.stopHeartbeat();
                    this.imagePaths = [];
                    this.setDirtyCanvas(true);
                }
            } catch (e) { 
                console.error(`[ImSELECT 🦊] Send selection error: `, e);
                alert(e); 
            }
        };

        api.addEventListener("rs-image-selector-start", (event) => {
            const { id, images } = event.detail;
            const node = app.graph.getNodeById(id);
            if (!node) return;

            if (node.imagePaths && node.imagePaths.length === images.length) {
                const isSame = node.imagePaths.every((path, index) => path === images[index]);
                if (isSame) {
                    node.setDirtyCanvas(true);
                    return;
                }
            }

            node.imagePaths = images;
            node.images = new Array(images.length);
            node.selectedIndices.clear();
            node.userResized = false;

            images.forEach((f, i) => {
                const img = new Image();
                img.src = api.apiURL(`/view?filename=${f}&type=temp`);
                img.onload = () => node.setDirtyCanvas(true);
                img.onerror = () => {
                    img.broken = true;
                    node.setDirtyCanvas(true);
                }
                node.images[i] = img;
            });

            node.startHeartbeat();
            console.log(`[ImSELECT 🦊] Heartbeat started for node ${id}`);

            if (node.autoSize) {
                node.autoSize(images.length);
            }

            node.setDirtyCanvas(true);
        });
    }
});