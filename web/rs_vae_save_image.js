import { app } from "../../scripts/app.js";

const NODE_TYPE = "RS_VAE_Decode_Save";
const MIN_WIDTH = 320;
const MIN_HEIGHT = 500;
const PREVIEW_GAP = 5;
const CLOSE_BTN_SIZE = 24;

app.registerExtension({
    name: "RaykoStudio.VAESaveImage",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== NODE_TYPE) return;

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            let result;
            if (originalOnNodeCreated) {
                result = originalOnNodeCreated.apply(this, arguments);
            }

            const self = this;

            // Скрываем стандартные виджеты ComfyUI
            if (this.widgets) {
                for (let i = 0; i < this.widgets.length; i++) {
                    this.widgets[i].hidden = true;
                }
            }

            // Инициализация состояния
            this.rs_data = { save_path: "", file_prefix: "img", format: "png" };
            
            const dataW = this.widgets?.find(w => w.name === "node_data");
            const pathW = this.widgets?.find(w => w.name === "save_path");
            const prefixW = this.widgets?.find(w => w.name === "file_prefix");
            const formatW = this.widgets?.find(w => w.name === "format");

            this.applyState = function() {
                if (pathW) pathW.value = self.rs_data.save_path;
                if (prefixW) prefixW.value = self.rs_data.file_prefix;
                if (formatW) formatW.value = self.rs_data.format;
                if (dataW) dataW.value = JSON.stringify(self.rs_data);
                self.updateUI();
            };

            this.persistState = function () {
                if (dataW) dataW.value = JSON.stringify(self.rs_data);
                if (pathW) pathW.value = self.rs_data.save_path;
                if (prefixW) prefixW.value = self.rs_data.file_prefix;
                if (formatW) formatW.value = self.rs_data.format;
            };

            this.getDisplayPath = function () {
                const path = self.rs_data.save_path;
                if (!path) return "ComfyUI";
                const isAbsolute = (path.length > 1 && path[1] === ':') || path.startsWith('/');
                if (!isAbsolute) return `ComfyUI/${path}`;
                return path;
            };

            // Настройки размеров и отступов
            this.rowHeight = 24;
            this.padding = 20;
            this.labelWidth = 70;
            this.clickZones = [];
            this.widgetsHeight = 0;
            
            // Хранилище для всех кадров батча
            this.imgs = [];
            this.imageIndex = 0;
            this.previewMode = 'grid'; // 'grid' или 'view'
            
            this.outputFolders = [];
            this.foldersLoaded = false;
            
            // Устанавливаем дефолтный И минимальный размер ноды
            this.setSize([MIN_WIDTH, MIN_HEIGHT]);
            this.min_size = [MIN_WIDTH, MIN_HEIGHT];

            // Защита от сжатия ниже минимума
            this.onResize = function() {
                if (this.size[0] < MIN_WIDTH) this.size[0] = MIN_WIDTH;
                if (this.size[1] < MIN_HEIGHT) this.size[1] = MIN_HEIGHT;
                this.setDirtyCanvas(true, true);
            };

            this.loadOutputFolders = async function () {
                if (self.foldersLoaded) return;
                try {
                    const resp = await fetch("/rs_folders");
                    if (resp.ok) {
                        const data = await resp.json();
                        self.outputFolders = data.subfolders || [];
                        self.foldersLoaded = true;
                    }
                } catch (e) {
                    self.outputFolders = [];
                }
            };
            this.loadOutputFolders();

            // Обработка данных от сервера (ПОЛНЫЙ БАТЧ)
            const onExecuted = this.onExecuted;
            this.onExecuted = function (message) {
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                
                if (message?.images && message.images.length > 0) {
                    this.imgs = [];
                    this.imageIndex = 0;
                    this.previewMode = 'grid'; // Сброс в режим сетки при новом батче
                    
                    // Загружаем ВСЕ изображения из батча
                    for (const image of message.images) {
                        const img = new Image();
                        
                        img.onload = () => {
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                        };
                        
                        img.onerror = () => {};
                        img.src = `/view?filename=${encodeURIComponent(image.filename)}&type=${image.type}&subfolder=${encodeURIComponent(image.subfolder || '')}`;
                        this.imgs.push(img);
                    }
                }
                return r;
            };

            // Отрисовка превью НА ЗАДНЕМ ПЛАНЕ
            this.onDrawBackground = function(ctx) {
                ctx.save();
                try {
                    if (this.imgs.length === 0) return;

                    const availableW = this.size[0] - this.padding * 2;
                    const availableH = this.size[1] - this.widgetsHeight - this.padding * 2;
                    const startY = this.widgetsHeight + this.padding;

                    if (availableW <= 0 || availableH <= 0) return;

                    // --- ПРОСТОЕ ПРЕВЬЮ ДЛЯ ОДНОГО ИЗОБРАЖЕНИЯ ---
                    if (this.imgs.length === 1) {
                        const img = this.imgs[0];
                        if (!img || !img.complete) return;

                        // Масштабируем изображение под доступную зону
                        const scale = Math.min(availableW / img.width, availableH / img.height);
                        const drawW = img.width * scale;
                        const drawH = img.height * scale;
                        const offsetX = (availableW - drawW) / 2;
                        const offsetY = (availableH - drawH) / 2;

                        const imgX = this.padding + offsetX;
                        const imgY = startY + offsetY;

                        // Рисуем изображение (без рамок ячеек и без крестика)
                        try {
                            ctx.drawImage(img, imgX, imgY, drawW, drawH);
                        } catch (e) {}
                        return; // Выходим, дальше идет логика только для батча
                    }

                    // --- ЛОГИКА ТОЛЬКО ДЛЯ ДВУХ И БОЛЕЕ ИЗОБРАЖЕНИЙ ---
                    if (this.previewMode === 'grid') {
                        // --- АДАПТИВНАЯ СЕТКА (формула из RS Image Selector) ---
                        const count = this.imgs.length;
                        const approxSide = Math.sqrt((availableW * availableH) / count);
                        let cols = Math.floor(availableW / approxSide);
                        if (cols < 1) cols = 1;
                        const rows = Math.ceil(count / cols);

                        const cellW = (availableW - PREVIEW_GAP * (cols - 1)) / cols;
                        const cellH = (availableH - PREVIEW_GAP * (rows - 1)) / rows;

                        for (let i = 0; i < this.imgs.length; i++) {
                            const img = this.imgs[i];
                            const col = i % cols;
                            const row = Math.floor(i / cols);
                            
                            const x = this.padding + col * (cellW + PREVIEW_GAP);
                            const y = startY + row * (cellH + PREVIEW_GAP);

                            // Фон ячейки
                            ctx.fillStyle = "#232323";
                            ctx.fillRect(x, y, cellW, cellH);
                            ctx.strokeStyle = "#444";
                            ctx.lineWidth = 1;
                            ctx.strokeRect(x, y, cellW, cellH);

                            // Рисуем миниатюру с сохранением пропорций (letterbox)
                            if (img.complete && img.naturalWidth > 0) {
                                const scale = Math.min(cellW / img.width, cellH / img.height);
                                const drawW = img.width * scale;
                                const drawH = img.height * scale;
                                const offsetX = (cellW - drawW) / 2;
                                const offsetY = (cellH - drawH) / 2;
                                
                                try {
                                    ctx.drawImage(img, x + offsetX, y + offsetY, drawW, drawH);
                                } catch (e) {}
                            }
                        }
                    } else {
                        // --- РЕЖИМ ПРОСМОТРА (только для батча) ---
                        const img = this.imgs[this.imageIndex];
                        if (!img || !img.complete) return;

                        // Масштабируем изображение под доступную зону
                        const scale = Math.min(availableW / img.width, availableH / img.height);
                        const drawW = img.width * scale;
                        const drawH = img.height * scale;
                        const offsetX = (availableW - drawW) / 2;
                        const offsetY = (availableH - drawH) / 2;

                        const imgX = this.padding + offsetX;
                        const imgY = startY + offsetY;

                        // Рисуем изображение
                        try {
                            ctx.drawImage(img, imgX, imgY, drawW, drawH);
                        } catch (e) {}

                        // Рисуем кнопку закрытия [×] в правом верхнем углу зоны превью
                        const btnX = this.size[0] - this.padding - CLOSE_BTN_SIZE;
                        const btnY = startY;
                        
                        // Фон кнопки для кликабельности
                        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                        ctx.beginPath();
                        ctx.arc(btnX + CLOSE_BTN_SIZE/2, btnY + CLOSE_BTN_SIZE/2, CLOSE_BTN_SIZE/2, 0, Math.PI * 2);
                        ctx.fill();
                        
                        // Сам крестик
                        ctx.strokeStyle = "#fff";
                        ctx.lineWidth = 2;
                        ctx.lineCap = "round";
                        const pad = 6;
                        ctx.beginPath();
                        ctx.moveTo(btnX + pad, btnY + pad);
                        ctx.lineTo(btnX + CLOSE_BTN_SIZE - pad, btnY + CLOSE_BTN_SIZE - pad);
                        ctx.moveTo(btnX + CLOSE_BTN_SIZE - pad, btnY + pad);
                        ctx.lineTo(btnX + pad, btnY + CLOSE_BTN_SIZE - pad);
                        ctx.stroke();
                    }
                } finally {
                    ctx.restore();
                }
            };

            // Отрисовка виджетов НА ПЕРЕДНЕМ ПЛАНЕ
            const origODF = this.onDrawForeground;
            this.onDrawForeground = function (ctx, vr) {
                ctx.save();
                try {
                    if (origODF) origODF.apply(this, arguments);
                    
                    this.clickZones = [];
                    const p = this.padding, lW = this.labelWidth, rH = this.rowHeight;
                    const iW = this.size[0] - p * 2 - lW;
                    let y = 45;

                    const btnW = 30;
                    const fieldW = iW - btnW - 4;

                    this.drawLabel(ctx, "PATH", p, y, lW, rH);
                    this.drawStringField(ctx, this.getDisplayPath(), p + lW, y, fieldW, rH);
                    this.drawBrowseButton(ctx, p + lW + fieldW + 4, y, btnW, rH);
                    this.clickZones.push({ type: "path", x: p + lW, y, w: fieldW, h: rH });
                    this.clickZones.push({ type: "browse", x: p + lW + fieldW + 4, y, w: btnW, h: rH });
                    y += rH + 4;

                    this.drawLabel(ctx, "PREFIX", p, y, lW, rH);
                    this.drawStringField(ctx, this.rs_data.file_prefix, p + lW, y, iW, rH);
                    this.clickZones.push({ type: "prefix", x: p + lW, y, w: iW, h: rH });
                    y += rH + 4;

                    this.drawLabel(ctx, "FORMAT", p, y, lW, rH);
                    this.drawComboField(ctx, this.rs_data.format.toUpperCase(), p + lW, y, iW, rH);
                    this.clickZones.push({ type: "format", x: p + lW, y, w: iW, h: rH });
                    y += rH + 10;

                    this.widgetsHeight = y;
                } finally {
                    ctx.restore();
                }
            };

            // Вспомогательные методы отрисовки UI
            this.drawLabel = function (ctx, t, x, y, w, h) {
                ctx.fillStyle = "#aaa";
                ctx.font = "11px sans-serif";
                ctx.textAlign = "left";
                ctx.fillText(t, x, y + h / 2 + 4);
            };

            this.drawStringField = function (ctx, v, x, y, w, h) {
                ctx.fillStyle = "#222";
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = "#444";
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = "#fff";
                ctx.font = "11px sans-serif";
                ctx.textAlign = "left";
                const d = v || "";
                ctx.fillText(d.length > 25 ? d.substring(0, 22) + "..." : d, x + 5, y + h / 2 + 4);
            };

            this.drawBrowseButton = function (ctx, x, y, w, h) {
                ctx.fillStyle = "#333";
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = "#555";
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = "#ccc";
                ctx.font = "bold 14px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("📁", x + w / 2, y + h / 2 + 5);
            };

            this.drawComboField = function (ctx, v, x, y, w, h) {
                ctx.fillStyle = "#222";
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = "#444";
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = "#fff";
                ctx.font = "11px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(v, x + w / 2, y + h / 2 + 4);
                ctx.fillStyle = "#666";
                ctx.beginPath();
                ctx.moveTo(x + w - 12, y + h / 2 - 3);
                ctx.lineTo(x + w - 6, y + h / 2 - 3);
                ctx.lineTo(x + w - 9, y + h / 2 + 3);
                ctx.fill();
            };

            // Обработка кликов
            this.onMouseDown = function (e, pos, canvas) {
                const availableW = this.size[0] - this.padding * 2;
                const availableH = this.size[1] - this.widgetsHeight - this.padding * 2;
                const startY = this.widgetsHeight + this.padding;

                // Для одного изображения никаких действий с превью не требуется
                if (this.imgs.length === 1) {
                    // Просто проверяем виджеты
                    for (const z of this.clickZones) {
                        if (pos[0] >= z.x && pos[0] <= z.x + z.w &&
                            pos[1] >= z.y && pos[1] <= z.y + z.h) {
                            if (z.type === "path") { self.showPathInput(e); return true; }
                            if (z.type === "browse") { self.showFolderSelector(e); return true; }
                            if (z.type === "prefix") { self.showPrefixInput(e); return true; }
                            if (z.type === "format") { self.showFormatSelector(e); return true; }
                        }
                    }
                    return false;
                }

                // --- ЛОГИКА ТОЛЬКО ДЛЯ ДВУХ И БОЛЕЕ ИЗОБРАЖЕНИЙ ---
                if (this.previewMode === 'view' && this.imgs.length > 0) {
                    // Проверка клика по кнопке закрытия [×]
                    const btnX = this.size[0] - this.padding - CLOSE_BTN_SIZE;
                    const btnY = startY;
                    
                    const centerX = btnX + CLOSE_BTN_SIZE / 2;
                    const centerY = btnY + CLOSE_BTN_SIZE / 2;
                    const dist = Math.sqrt(Math.pow(pos[0] - centerX, 2) + Math.pow(pos[1] - centerY, 2));
                    
                    if (dist <= CLOSE_BTN_SIZE / 2) {
                        this.previewMode = 'grid';
                        if (this.graph) this.graph.setDirtyCanvas(true, true);
                        return true;
                    }
                }

                if (this.previewMode === 'grid' && this.imgs.length > 0) {
                    // Проверка клика по ячейке сетки (та же формула, что и в отрисовке)
                    const count = this.imgs.length;
                    const approxSide = Math.sqrt((availableW * availableH) / count);
                    let cols = Math.floor(availableW / approxSide);
                    if (cols < 1) cols = 1;
                    const rows = Math.ceil(count / cols);

                    const cellW = (availableW - PREVIEW_GAP * (cols - 1)) / cols;
                    const cellH = (availableH - PREVIEW_GAP * (rows - 1)) / rows;

                    for (let i = 0; i < this.imgs.length; i++) {
                        const col = i % cols;
                        const row = Math.floor(i / cols);
                        
                        const x = this.padding + col * (cellW + PREVIEW_GAP);
                        const y = startY + row * (cellH + PREVIEW_GAP);
                        
                        if (pos[0] >= x && pos[0] <= x + cellW &&
                            pos[1] >= y && pos[1] <= y + cellH) {
                            this.imageIndex = i;
                            this.previewMode = 'view';
                            if (this.graph) this.graph.setDirtyCanvas(true, true);
                            return true;
                        }
                    }
                }

                // Проверка зон виджетов
                for (const z of this.clickZones) {
                    if (pos[0] >= z.x && pos[0] <= z.x + z.w &&
                        pos[1] >= z.y && pos[1] <= z.y + z.h) {
                        if (z.type === "path") { self.showPathInput(e); return true; }
                        if (z.type === "browse") { self.showFolderSelector(e); return true; }
                        if (z.type === "prefix") { self.showPrefixInput(e); return true; }
                        if (z.type === "format") { self.showFormatSelector(e); return true; }
                    }
                }
                return false;
            };

            // Меню выбора папки
            this.showFolderSelector = function (ev) {
                if (!self.foldersLoaded) {
                    self.loadOutputFolders().then(() => self.showFolderSelector(ev));
                    return;
                }

                const menu = document.createElement("div");
                menu.style.cssText = 'position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:6px;overflow:hidden;z-index:10001;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:200px;max-height:350px;overflow-y:auto;';

                const rootItem = document.createElement("div");
                rootItem.textContent = "ComfyUI";
                rootItem.style.cssText = 'padding:8px 15px;cursor:pointer;color:#ddd;font-size:12px;border-bottom:1px solid #333;';
                if (!self.rs_data.save_path) {
                    rootItem.style.background = "#333";
                    rootItem.style.color = "#4CAF50";
                }
                rootItem.onmouseover = () => { if (self.rs_data.save_path) rootItem.style.background = "#333"; };
                rootItem.onmouseout = () => { if (self.rs_data.save_path) rootItem.style.background = "#1a1a1a"; };
                rootItem.onclick = (e) => {
                    e.stopPropagation(); e.preventDefault();
                    self.rs_data.save_path = "";
                    self.persistState(); self.updateUI(); menu.remove();
                };
                menu.appendChild(rootItem);

                const customItem = document.createElement("div");
                customItem.textContent = "️ Custom path...";
                customItem.style.cssText = 'padding:8px 15px;cursor:pointer;color:#aaa;font-size:12px;border-bottom:1px solid #333;';
                customItem.onmouseover = () => customItem.style.background = "#333";
                customItem.onmouseout = () => customItem.style.background = "#1a1a1a";
                customItem.onclick = (e) => {
                    e.stopPropagation(); e.preventDefault();
                    menu.remove();
                    self.showPathInput(ev);
                };
                menu.appendChild(customItem);

                const sep = document.createElement("div");
                sep.style.cssText = 'height:1px;background:#333;margin:4px 0;';
                menu.appendChild(sep);

                if (self.outputFolders.length === 0) {
                    const emptyItem = document.createElement("div");
                    emptyItem.textContent = "(no subfolders)";
                    emptyItem.style.cssText = 'padding:8px 15px;color:#666;font-size:12px;cursor:default;';
                    menu.appendChild(emptyItem);
                } else {
                    self.outputFolders.forEach(folder => {
                        const item = document.createElement("div");
                        item.textContent = folder;
                        item.style.cssText = 'padding:8px 15px;cursor:pointer;color:#ddd;font-size:12px;border-bottom:1px solid #333;';
                        if (folder === self.rs_data.save_path) {
                            item.style.background = "#333";
                            item.style.color = "#4CAF50";
                        }
                        item.onmouseover = () => { if (folder !== self.rs_data.save_path) item.style.background = "#333"; };
                        item.onmouseout = () => { if (folder !== self.rs_data.save_path) item.style.background = "#1a1a1a"; };
                        item.onclick = (e) => {
                            e.stopPropagation(); e.preventDefault();
                            self.rs_data.save_path = folder;
                            self.persistState(); self.updateUI(); menu.remove();
                        };
                        menu.appendChild(item);
                    });
                }

                if (ev) {
                    menu.style.left = (ev.clientX + 8) + "px";
                    menu.style.top = (ev.clientY + 8) + "px";
                }
                document.body.appendChild(menu);

                setTimeout(() => {
                    const closeHandler = (e) => { if (!menu.contains(e.target)) { cleanup(); } };
                    const mouseLeaveHandler = () => { cleanup(); };
                    const cleanup = () => {
                        menu.remove();
                        document.removeEventListener("mousedown", closeHandler);
                        menu.removeEventListener("mouseleave", mouseLeaveHandler);
                    };
                    document.addEventListener("mousedown", closeHandler);
                    menu.addEventListener("mouseleave", mouseLeaveHandler);
                }, 100);
            };

            // Поле ввода пути
            this.showPathInput = function (ev) {
                const cv = self.rs_data.save_path || '';
                const pop = document.createElement('div');
                pop.style.cssText = 'position:fixed;z-index:10002;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:8px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;';
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = cv;
                inp.placeholder = 'e.g. I:/Renders or project_v2';
                inp.style.cssText = 'width:220px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:12px;font-family:sans-serif;outline:none;';
                const btn = document.createElement('button');
                btn.textContent = 'OK';
                btn.style.cssText = 'background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;min-width:28px;';
                btn.onmouseover = () => btn.style.background = "#45a049";
                btn.onmouseout = () => btn.style.background = "#4CAF50";
                pop.appendChild(inp);
                pop.appendChild(btn);
                if (ev) { pop.style.left = (ev.clientX + 8) + 'px'; pop.style.top = (ev.clientY + 8) + 'px'; }
                document.body.appendChild(pop);
                setTimeout(() => { inp.focus(); if (cv.length) inp.select(); }, 50);
                
                const save = () => { self.rs_data.save_path = inp.value; self.persistState(); self.updateUI(); cleanup(); };
                const cleanup = () => { pop.remove(); document.removeEventListener("mousedown", cl); };
                btn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); save(); };
                inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
                const cl = (e) => { if (!pop.contains(e.target)) { cleanup(); } };
                setTimeout(() => { document.addEventListener("mousedown", cl); }, 50);
            };

            // Поле ввода префикса
            this.showPrefixInput = function (ev) {
                const cv = self.rs_data.file_prefix || 'img';
                const pop = document.createElement('div');
                pop.style.cssText = 'position:fixed;z-index:10002;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:8px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;';
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = cv;
                inp.style.cssText = 'width:220px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:12px;font-family:sans-serif;outline:none;';
                const btn = document.createElement('button');
                btn.textContent = 'OK';
                btn.style.cssText = 'background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;min-width:28px;';
                btn.onmouseover = () => btn.style.background = "#45a049";
                btn.onmouseout = () => btn.style.background = "#4CAF50";
                pop.appendChild(inp);
                pop.appendChild(btn);
                if (ev) { pop.style.left = (ev.clientX + 8) + 'px'; pop.style.top = (ev.clientY + 8) + 'px'; }
                document.body.appendChild(pop);
                setTimeout(() => { inp.focus(); if (cv.length) inp.select(); }, 50);
                
                const save = () => { self.rs_data.file_prefix = inp.value; self.persistState(); self.updateUI(); cleanup(); };
                const cleanup = () => { pop.remove(); document.removeEventListener("mousedown", cl); };
                btn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); save(); };
                inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
                const cl = (e) => { if (!pop.contains(e.target)) { cleanup(); } };
                setTimeout(() => { document.addEventListener("mousedown", cl); }, 50);
            };

            // Выбор формата
            this.showFormatSelector = function (ev) {
                const FMTS = ["png", "jpg", "webp"];
                const menu = document.createElement("div");
                menu.style.cssText = 'position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:6px;overflow:hidden;z-index:10001;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:120px;';
                FMTS.forEach(f => {
                    const it = document.createElement("div");
                    it.textContent = f.toUpperCase();
                    it.style.cssText = 'padding:8px 15px;cursor:pointer;color:#ddd;font-size:12px;border-bottom:1px solid #333;';
                    if (f === self.rs_data.format) { it.style.background = "#333"; it.style.color = "#4CAF50"; }
                    it.onmouseover = () => { if (f !== self.rs_data.format) it.style.background = "#333"; };
                    it.onmouseout = () => { if (f !== self.rs_data.format) it.style.background = "#1a1a1a"; };
                    it.onclick = (e) => {
                        e.stopPropagation(); e.preventDefault();
                        self.rs_data.format = f;
                        self.persistState();
                        self.updateUI();
                        menu.remove();
                    };
                    menu.appendChild(it);
                });
                if (ev) { menu.style.left = (ev.clientX + 8) + "px"; menu.style.top = (ev.clientY + 8) + "px"; }
                document.body.appendChild(menu);
                setTimeout(() => {
                    const cl = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("mousedown", cl); } };
                    document.addEventListener("mousedown", cl);
                }, 100);
            };

            this.updateUI = function () {
                if (self.graph) self.graph.setDirtyCanvas(true, true);
            };

            // Восстановление состояния при загрузке воркфлоу
            const originalOnConfigure = this.onConfigure;
            this.onConfigure = function(info) {
                const r = originalOnConfigure ? originalOnConfigure.apply(this, arguments) : undefined;
                
                const savedDataW = this.widgets?.find(w => w.name === "node_data");
                if (savedDataW && savedDataW.value && savedDataW.value !== "{}") {
                    try {
                        const parsed = JSON.parse(savedDataW.value);
                        this.rs_data = { ...this.rs_data, ...parsed };
                        this.applyState();
                    } catch (e) { console.warn("[RS] Restore error", e); }
                }
                return r;
            };

            return result;
        };
    }
});