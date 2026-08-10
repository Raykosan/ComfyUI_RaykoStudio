import { app } from "../../scripts/app.js";

const NODE_TYPE = "RSSaveLoRA";

app.registerExtension({
    name: "RaykoStudio.SaveImageLoRA",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== NODE_TYPE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const self = this;

            if (this.widgets) this.widgets.forEach(w => w.hidden = true);

            this.rs_data = { filename_prefix: "ComfyUI" };

            const prefixW = this.widgets?.find(w => w.name === "filename_prefix");
            if (prefixW) this.rs_data.filename_prefix = prefixW.value || "ComfyUI";

            this.rowHeight = 24;
            this.padding = 10;
            this.labelWidth = 70;
            this.targetWidth = 320;
            this.clickZones = [];
            this.widgetsHeight = 0;
            this.setSize([this.targetWidth, 75]);
            this.widgets_start_y = 65;

            this.syncToWidgets = function () {
                if (prefixW) prefixW.value = self.rs_data.filename_prefix;
            };

            const onConfigure = this.onConfigure;
            this.onConfigure = function (info) {
                const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                const w = self.widgets?.find(x => x.name === "filename_prefix");
                if (w && typeof w.value === "string" && w.value.length) {
                    self.rs_data.filename_prefix = w.value;
                }
                return r;
            };

            const origODF = this.onDrawForeground;
            this.onDrawForeground = function (ctx, vr) {
                if (origODF) origODF.apply(this, arguments);
                this.clickZones = [];
                const p = this.padding, lW = this.labelWidth, rH = this.rowHeight;
                const iW = this.size[0] - p * 2 - lW;
                let y = 30;

                this.drawLabel(ctx, "PREFIX", p, y, lW, rH);
                this.drawStringField(ctx, this.rs_data.filename_prefix, p + lW, y, iW, rH);
                this.clickZones.push({ type: "prefix", x: p + lW, y, w: iW, h: rH });
                y += rH + 4;

                this.widgetsHeight = y;
            };

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
                ctx.fillText(d.length > 28 ? d.substring(0, 25) + "..." : d, x + 5, y + h / 2 + 4);
            };

            const origMouseDown = this.onMouseDown;
            this.onMouseDown = function (e, pos, canvas) {
                for (const z of this.clickZones) {
                    if (pos[0] >= z.x && pos[0] <= z.x + z.w &&
                        pos[1] >= z.y && pos[1] <= z.y + z.h) {
                        if (z.type === "prefix") { self.showPrefixInput(e); return true; }
                    }
                }
                return origMouseDown ? origMouseDown.apply(this, arguments) : false;
            };

            this.showPrefixInput = function (ev) {
                const cv = self.rs_data.filename_prefix || '';
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
                const save = () => { self.rs_data.filename_prefix = inp.value; self.syncToWidgets(); self.updateUI(); pop.remove(); };
                btn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); save(); };
                inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
                setTimeout(() => {
                    const cl = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("mousedown", cl); } };
                    document.addEventListener("mousedown", cl);
                }, 50);
            };

            this.updateUI = function () {
                self.syncToWidgets();
                if (self.graph) self.graph.setDirtyCanvas(true, true);
            };

            const onSerialize = this.onSerialize;
            this.onSerialize = function (o) {
                self.syncToWidgets();
                return onSerialize ? onSerialize.apply(this, arguments) : undefined;
            };

            const onExecute = this.onExecute;
            this.onExecute = function () {
                self.syncToWidgets();
                return onExecute ? onExecute.apply(this, arguments) : undefined;
            };

            return result;
        };
    }
});