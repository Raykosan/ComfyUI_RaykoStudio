import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

app.registerExtension({
    name: "RaykoStudio.RSCollage",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "RSCollage") return;
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);
            
            this.overlay = { x:0, y:0, width:100, height:100, rotation:0, flipH:false, flipV:false };
            this.overlayRelative = { x:0.5, y:0.5, width:0.3, height:0.3, rotation:0, flipH:false, flipV:false };
            this.realOverlay = { width:0, height:0 }; 
            this.realBackground = { width:0, height:0 };
            
            this.displayWidth = 420; this.displayHeight = 420; this.canvasPixelSize = 420;
            this.viewScale = 1.0; 
            this.viewOffsetX = 0; this.viewOffsetY = 0;
            
            this.overlayImage = null; this.backgroundImage = null;
            this.isEditing = false; this.isLoading = false; this.dragType = null;
            this.dragState = null;
            this.currentSessionTimestamp = null; 
            
            this.opacity = 1.0; this.featherType = "None";
            this.edgeRadius = 150; this.shapeRadius = 0;
            
            this.featherCenter = { x:0.5, y:0.5 };
            this.canvasRealWidth = 0; this.canvasRealHeight = 0;
            this.minWidth = 500; this.minHeight = 780;
            this.setSize([this.minWidth, this.minHeight]);
            this.btnApplyHover = false; this.btnFlipHHover = false; this.btnFlipVHover = false; this.btnCancelHover = false;
            this.featherPreviewCanvas = null; this.previewDirty = true; this.previewMaxSize = 512;
            this.pendingEditorData = null;

            ["opacity","feather_type","edge_radius","shape_radius"].forEach(n => {
                const w = this.widgets?.find(w => w.name === n); if (w) w.hidden = true;
            });
            this.addWidget("slider", "opacity", 1.0, v => { this.opacity = v; this.setDirtyCanvas(true); }, { min:0, max:1, step:0.01 });
            this.addWidget("combo", "feather_type", "None", v => { this.featherType = v; this.previewDirty = true; this.setDirtyCanvas(true); }, { values:["None","Radial In","Radial Out","Edge","Shape"] });
            this.addWidget("slider", "edge_radius", 150, v => { this.edgeRadius = v; this.previewDirty = true; this.setDirtyCanvas(true); }, { min:0, max:300, step:1 }); 
            this.addWidget("slider", "shape_radius", 0, v => { this.shapeRadius = v; this.previewDirty = true; this.setDirtyCanvas(true); }, { min:0, max:5, step:1 }); 

            api.addEventListener("rs-collage-start", (event) => {
                if (event.detail.id != this.id) return;
                this.pendingEditorData = event.detail;
                this.openDeferredEditor();
            });

            api.addEventListener("rs-collage-ready", (event) => {
                if (event.detail.id != this.id) return;
                this.pendingEditorData = event.detail;
            });

            api.addEventListener("interrupted", () => {
                this.pendingEditorData = null;
                this.isLoading = false;
                this.isEditing = false;
                this.dragType = null;
                this.dragState = null;
                this.setDirtyCanvas(true);
            });
        };

        nodeType.prototype.openDeferredEditor = function() {
            if (!this.pendingEditorData) return;
            const data = this.pendingEditorData;
            this.overlayImage = null; this.backgroundImage = null; this.isLoading = true;
            this.currentSessionTimestamp = data.timestamp;
            this.opacity = data.opacity !== undefined ? data.opacity : 1.0;
            this.featherType = data.feather_type || "None";
            this.edgeRadius = data.edge_radius || 150;
            this.shapeRadius = data.shape_radius || 0;
            this.featherCenter = { x:0.5, y:0.5 }; this.previewDirty = true;
            
            ["opacity","feather_type","edge_radius","shape_radius"].forEach(n => {
                const w = this.widgets?.find(w => w.name === n); if (w) w.value = this[n];
            });

            this.realBackground = { width:data.bg_width, height:data.bg_height };
            this.realOverlay = { width:data.ov_width, height:data.ov_height };
            this.canvasRealWidth = this.realBackground.width;
            this.canvasRealHeight = this.realBackground.height;
            
            this.updateDisplaySize(this.canvasPixelSize);
            
            const bgFile = data.bg_file, ovFile = data.ov_file, ts = data.timestamp;
            let loaded = 0;
            const onLoad = () => {
                loaded++; 
                if (loaded === 2) {
                    requestAnimationFrame(() => {
                        this.isLoading = false;
                        const tS = this.canvasPixelSize * 0.5;
                        const sM = Math.min(this.realOverlay.width, this.realOverlay.height);
                        let sc = tS / sM, nw = this.realOverlay.width*sc, nh = this.realOverlay.height*sc;
                        if (nw > this.canvasPixelSize) { nw = this.canvasPixelSize; nh = nw/(this.realOverlay.width/this.realOverlay.height); }
                        if (nh > this.canvasPixelSize) { nh = this.canvasPixelSize; nw = nh*(this.realOverlay.width/this.realOverlay.height); }
                        
                        this.overlayRelative = { 
                            width: nw/this.displayWidth, height: nh/this.displayHeight, 
                            x: 0.5, y: 0.5, rotation:0, flipH:false, flipV:false 
                        };
                        
                        this.updateOverlayAbsolute();
                        this.computeAndApplyView();
                        
                        this.isEditing = true; 
                        this.setDirtyCanvas(true);
                    });
                }
            };
            const loadImg = (file, type) => {
                if (!file) { onLoad(); return; }
                const img = new Image(); img.crossOrigin = "Anonymous";
                img.onload = () => { this[type] = img; onLoad(); };
                img.onerror = () => { onLoad(); };
                img.src = `/view?filename=${file}&type=temp&t=${ts}`;
            };
            loadImg(bgFile, "backgroundImage"); loadImg(ovFile, "overlayImage");
        };

        nodeType.prototype.updateOverlayAbsolute = function() {
            this.overlay.x = (this.overlayRelative.x - 0.5) * this.displayWidth;
            this.overlay.y = (this.overlayRelative.y - 0.5) * this.displayHeight;
            this.overlay.width = this.overlayRelative.width * this.displayWidth;
            this.overlay.height = this.overlayRelative.height * this.displayHeight;
            this.overlay.rotation = this.overlayRelative.rotation;
            this.overlay.flipH = this.overlayRelative.flipH;
            this.overlay.flipV = this.overlayRelative.flipV;
        };

        nodeType.prototype.updateRelativeFromAbsolute = function() {
            this.overlayRelative.x = (this.overlay.x / this.displayWidth) + 0.5;
            this.overlayRelative.y = (this.overlay.y / this.displayHeight) + 0.5;
            this.overlayRelative.width = this.overlay.width / this.displayWidth;
            this.overlayRelative.height = this.overlay.height / this.displayHeight;
            this.overlayRelative.rotation = this.overlay.rotation;
            this.overlayRelative.flipH = this.overlay.flipH;
            this.overlayRelative.flipV = this.overlay.flipV;
        };

        nodeType.prototype.computeAndApplyView = function() {
            const bgW = this.displayWidth, bgH = this.displayHeight;
            const ovL = this.overlay.x - this.overlay.width/2, ovT = this.overlay.y - this.overlay.height/2;
            const ovR = this.overlay.x + this.overlay.width/2, ovB = this.overlay.y + this.overlay.height/2;
            const bgL = -bgW/2, bgT = -bgH/2, bgR = bgW/2, bgB = bgH/2;
            
            const minX = Math.min(ovL, bgL), minY = Math.min(ovT, bgT);
            const maxX = Math.max(ovR, bgR), maxY = Math.max(ovB, bgB);
            const contentW = Math.max(1, maxX - minX);
            const contentH = Math.max(1, maxY - minY);
            const contentCX = (minX + maxX) / 2;
            const contentCY = (minY + maxY) / 2;
            
            const availableW = this.canvasPixelSize * 0.9;
            const availableH = this.canvasPixelSize * 0.9;
            const scaleX = availableW / contentW;
            const scaleY = availableH / contentH;
            this.viewScale = Math.max(0.1, Math.min(3.0, Math.min(scaleX, scaleY)));
            
            this.viewOffsetX = this.canvasPixelSize / 2 - (contentCX * this.viewScale);
            this.viewOffsetY = this.canvasPixelSize / 2 - (contentCY * this.viewScale);
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

        nodeType.prototype.generateFeatherPreview = function() {
            if (!this.overlayImage || this.featherType === "None") { this.featherPreviewCanvas = null; this.previewDirty = false; return; }
            const isShape = this.featherType === "Shape";
            const rVal = isShape ? this.shapeRadius : this.edgeRadius;
            if (rVal <= 0 && !isShape) { this.featherPreviewCanvas = null; this.previewDirty = false; return; }
            const mW = Math.min(this.realOverlay.width, this.previewMaxSize), mH = Math.min(this.realOverlay.height, this.previewMaxSize);
            const sc = Math.min(1, Math.min(mW/this.realOverlay.width, mH/this.realOverlay.height));
            const w = Math.round(this.realOverlay.width*sc), h = Math.round(this.realOverlay.height*sc);
            if (!this.featherPreviewCanvas || this.featherPreviewCanvas.width!==w || this.featherPreviewCanvas.height!==h) {
                this.featherPreviewCanvas = document.createElement('canvas'); this.featherPreviewCanvas.width = w; this.featherPreviewCanvas.height = h;
            }
            const ctx = this.featherPreviewCanvas.getContext('2d');
            ctx.clearRect(0,0,w,h); ctx.drawImage(this.overlayImage,0,0,w,h);
            const imgD = ctx.getImageData(0,0,w,h), d = imgD.data;
            const cx = this.featherCenter.x * w, cy = this.featherCenter.y * h;
            if (!isShape) {
                let maxDist;
                if (this.featherType.includes("Radial")) maxDist = Math.hypot(Math.max(cx,w-cx), Math.max(cy,h-cy)) || 1;
                else maxDist = Math.min(w,h)/2 || 1;
                const featherWidth = Math.max((rVal / 300.0) * maxDist, 1.0);
                for (let y=0; y<h; y++) { for (let x=0; x<w; x++) { const i = (y*w+x)*4; if (d[i+3]===0) continue; let dist; if (this.featherType.includes("Radial")) dist = Math.hypot(x-cx, y-cy); else dist = Math.min(x, w-1-x, y, h-1-y); let mask; if (this.featherType.includes("Radial")) { mask = 1.0 - Math.min(1.0, Math.max(0.0, dist / featherWidth)); 
                    if (this.featherType === "Radial Out") mask = 1.0 - mask;
                } else { mask = Math.min(1.0, Math.max(0.0, dist / featherWidth)); } d[i+3] *= mask; } }
            } else {
                const mx = Math.min(rVal*1.5, Math.max(w,h));
                for (let y=0; y<h; y++) { for (let x=0; x<w; x++) { const i = (y*w+x)*4; if (d[i+3]===0) continue; let dd = Infinity; const step=2; for (let r=1; r<=mx; r+=step) { let found=false; for (let a=0; a<8; a++) { const ang=(a/8)*Math.PI*2, nx=Math.round(x+Math.cos(ang)*r), ny=Math.round(y+Math.sin(ang)*r); if (nx>=0 && nx<w && ny>=0 && ny<h && d[(ny*w+nx)*4+3]<30) { dd=r; found=true; break; } } if (found) break; } const dist = dd===Infinity ? 0 : dd*sc; d[i+3] *= Math.min(1, 1 - dist/rVal); } }
            }
            ctx.putImageData(imgD,0,0); this.previewDirty = false;
        };

        nodeType.prototype.getRealTransform = function() {
            const dS = this.canvasRealWidth / (this.displayWidth || 1); 
            const absX = (this.overlay.x * dS) + (this.canvasRealWidth / 2);
            const absY = (this.overlay.y * dS) + (this.canvasRealHeight / 2);
            return { 
                x: absX, y: absY,
                scale_x: (this.overlay.width * dS) / (this.realOverlay.width || 1),
                scale_y: (this.overlay.height * dS) / (this.realOverlay.height || 1),
                rotation: this.overlay.rotation, 
                flip_h: this.overlay.flipH, 
                flip_v: this.overlay.flipV 
            };
        };

        nodeType.prototype.computeScreenHandles = function(rectX, rectY, useScale, useOffsetX, useOffsetY) {
            const hw = this.overlay.width / 2;
            const hh = this.overlay.height / 2;
            const rotationRad = this.overlay.rotation * Math.PI / 180;
            const cos = Math.cos(rotationRad);
            const sin = Math.sin(rotationRad);
            const flipX = this.overlay.flipH ? -1 : 1;
            const flipY = this.overlay.flipV ? -1 : 1;
            
            const handles = {
                'scale-tl': { x: -hw, y: -hh },
                'scale-tr': { x: hw, y: -hh },
                'scale-bl': { x: -hw, y: hh },
                'scale-br': { x: hw, y: hh },
                'scale-t': { x: 0, y: -hh },
                'scale-b': { x: 0, y: hh },
                'scale-l': { x: -hw, y: 0 },
                'scale-r': { x: hw, y: 0 },
                'rotate': { x: 0, y: -hh - 40 },
                'feather-center': { 
                    x: (this.featherCenter.x - 0.5) * this.overlay.width, 
                    y: (this.featherCenter.y - 0.5) * this.overlay.height 
                }
            };
            
            const screenHandles = {};
            for (const [name, local] of Object.entries(handles)) {
                const rx = local.x * cos - local.y * sin;
                const ry = local.x * sin + local.y * cos;
                const fx = rx * flipX;
                const fy = ry * flipY;
                const wx = this.overlay.x + fx;
                const wy = this.overlay.y + fy;
                const sx = rectX + useOffsetX + (wx * useScale);
                const sy = rectY + useOffsetY + (wy * useScale);
                screenHandles[name] = { x: sx, y: sy };
            }
            return screenHandles;
        };

        nodeType.prototype.sendTransforms = async function() {
            const payload = { 
                id: String(this.id), transforms: this.getRealTransform(), opacity: this.opacity, feather_type: this.featherType,
                edge_radius: Math.round(this.edgeRadius), shape_radius: Math.round(this.shapeRadius),
                feather_center_x: this.featherCenter.x, feather_center_y: this.featherCenter.y 
            };
            try { 
                await api.fetchApi("/rayko/rs_collage", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) }); 
                this.isEditing = false; this.setDirtyCanvas(true); 
            } catch(e) { /* Silent fail */ }
        };

        nodeType.prototype.cancelEditing = async function() {
            try { await api.interrupt(); } catch(e) {}
            await fetch("/rayko/rs_collage/cancel", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ node_id: String(this.id) }) });
            this.isEditing = false; this.isLoading = false; this.dragType = null; this.dragState = null; this.setDirtyCanvas(true);
        };

        nodeType.prototype.onResize = function(size) { 
            if(size[0] < this.minWidth) size[0] = this.minWidth; 
            if(size[1] < this.minHeight) size[1] = this.minHeight; 
            this.setDirtyCanvas(true); 
        };
        
        nodeType.prototype.getCanvasMetrics = function() {
            const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
            const canvasTopPadding = 150;
            const btnAreaH = 90;
            const maxCanvasH = this.size[1] - titleH - canvasTopPadding - btnAreaH;
            const cSize = Math.max(300, Math.min(this.size[0] - 40, maxCanvasH));
            const rectX = (this.size[0] - cSize) / 2;
            const rectY = titleH + canvasTopPadding;
            return { cSize, rectX, rectY };
        };

        nodeType.prototype.onDrawForeground = function(ctx) {
            const { cSize, rectX, rectY } = this.getCanvasMetrics();
            ctx.fillStyle = "#1e1e1e"; ctx.fillRect(rectX, rectY, cSize, cSize); 
            ctx.strokeStyle = "#555"; ctx.strokeRect(rectX, rectY, cSize, cSize);
            this.updateDisplaySize(cSize);

            if (!this.dragState) { this.updateOverlayAbsolute(); this.computeAndApplyView(); }

            if (this.isLoading) { 
                ctx.fillStyle = "#888"; ctx.font = "12px Arial"; ctx.fillText("Loading...", rectX + cSize/2 - 35, rectY + cSize/2); 
            } else if (this.isEditing && this.backgroundImage) {
                const useScale = this.dragState ? this.dragState.viewScale : this.viewScale;
                const useOffsetX = this.dragState ? this.dragState.viewOffsetX : this.viewOffsetX;
                const useOffsetY = this.dragState ? this.dragState.viewOffsetY : this.viewOffsetY;

                ctx.save();
                ctx.translate(rectX + useOffsetX, rectY + useOffsetY);
                ctx.scale(useScale, useScale);
                ctx.drawImage(this.backgroundImage, -this.displayWidth/2, -this.displayHeight/2, this.displayWidth, this.displayHeight);
                
                if (this.overlayImage) {
                    if (this.previewDirty) this.generateFeatherPreview();
                    const prev = this.featherPreviewCanvas || this.overlayImage;
                    ctx.save(); 
                    ctx.translate(this.overlay.x, this.overlay.y); 
                    ctx.rotate(this.overlay.rotation * Math.PI / 180);
                    ctx.scale(this.overlay.flipH ? -1 : 1, this.overlay.flipV ? -1 : 1); 
                    ctx.globalAlpha = this.opacity;
                    ctx.drawImage(prev, -this.overlay.width/2, -this.overlay.height/2, this.overlay.width, this.overlay.height); 
                    ctx.globalAlpha = 1;
                    ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4 / useScale;
                    ctx.strokeStyle = "#00E5FF"; ctx.lineWidth = 2 / useScale;
                    ctx.strokeRect(-this.overlay.width/2, -this.overlay.height/2, this.overlay.width, this.overlay.height);
                    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
                    
                    const hw = this.overlay.width/2, hh = this.overlay.height/2, hs = 6/useScale;
                    ctx.fillStyle = "#FF0000";
                    [[hw, hh], [-hw, hh], [hw, -hh], [-hw, -hh]].forEach(([x,y]) => ctx.fillRect(x-hs/2, y-hs/2, hs, hs));
                    [[hw, 0], [-hw, 0], [0, hh], [0, -hh]].forEach(([x,y]) => ctx.fillRect(x-hs/2, y-hs/2, hs, hs));
                    
                    const rotHandleY = -hh - 40;
                    ctx.beginPath(); ctx.arc(0, rotHandleY, 5/useScale, 0, Math.PI*2); ctx.fillStyle = "#ff9800"; ctx.fill();
                    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1/useScale; ctx.stroke();
                    
                    if ((this.featherType === "Radial Out" || this.featherType === "Radial In") && this.edgeRadius > 0) {
                        const fCx = (this.featherCenter.x - 0.5) * this.overlay.width;
                        const fCy = (this.featherCenter.y - 0.5) * this.overlay.height;
                        ctx.strokeStyle = "#00CED1"; ctx.lineWidth = 2/useScale;
                        ctx.beginPath(); ctx.moveTo(fCx-10, fCy); ctx.lineTo(fCx+10, fCy); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(fCx, fCy-10); ctx.lineTo(fCx, fCy+10); ctx.stroke();
                        ctx.beginPath(); ctx.arc(fCx, fCy, 4, 0, Math.PI*2); ctx.stroke();
                    }
                    ctx.restore();
                }
                ctx.restore();
                ctx.fillStyle = "#ff9800"; ctx.font = "12px Arial"; 
                ctx.fillText(` EDITING (Scale: ${(useScale*100).toFixed(0)}%)`, rectX + cSize - 160, rectY + cSize - 10);
            } else { 
                ctx.fillStyle = "#888"; ctx.font = "12px Arial"; ctx.fillText("▶ Run queue to start", rectX + cSize/2 - 65, rectY + cSize/2); 
            }

            const btnW = (this.size[0]-50)/2, btnH = 30, gap = 10;
            const y2 = this.size[1] - btnH - 15;
            const y1 = y2 - btnH - gap;
            const rR = (ctx,x,y,w,h,r) => {
                ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
                ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
                ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
            };
            [[15,y1," FLIP H",this.btnFlipHHover,"#2196F3"],
             [15+btnW+gap,y1," FLIP V",this.btnFlipVHover,"#2196F3"],
             [15,y2,"✓ APPLY",this.btnApplyHover,"#4CAF50"],
             [15+btnW+gap,y2," CANCEL",this.btnCancelHover,"#dc3545"]].forEach(([bx,by,txt,hov,col]) => {
                ctx.fillStyle = hov ? "#444" : "#2a2a2a"; rR(ctx,bx,by,btnW,btnH,6); ctx.fill(); ctx.strokeStyle = col; ctx.stroke();
                ctx.fillStyle = col; ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, bx+btnW/2, by+btnH/2);
            });
        };

        nodeType.prototype.onMouseDown = function(event, pos) {
            if (!this.isEditing || this.isLoading || !this.overlayImage) return;
            
            const { cSize, rectX, rectY } = this.getCanvasMetrics();
            const mx = pos[0], my = pos[1];
            const frozenScale = this.viewScale, frozenOffsetX = this.viewOffsetX, frozenOffsetY = this.viewOffsetY;
            const worldMx = (mx - rectX - frozenOffsetX) / frozenScale;
            const worldMy = (my - rectY - frozenOffsetY) / frozenScale;

            const screenHandles = this.computeScreenHandles(rectX, rectY, frozenScale, frozenOffsetX, frozenOffsetY);
            
            const cornerSize = 14, edgeSize = 18, rotateSize = 22, featherSize = 18;
            let detectedType = null, minDist = Infinity;
            
            const checkHandle = (name, h, threshold) => {
                const dist = Math.hypot(mx - h.x, my - h.y);
                if (dist < threshold && dist < minDist) { detectedType = name; minDist = dist; }
            };

            const edgeHandles = ['scale-t', 'scale-b', 'scale-l', 'scale-r'];
            for (const [name, pos] of Object.entries(screenHandles)) {
                const isEdge = edgeHandles.includes(name);
                const threshold = name === 'rotate' ? rotateSize 
                    : (name === 'feather-center' ? featherSize 
                    : (isEdge ? edgeSize : cornerSize));
                checkHandle(name, pos, threshold);
            }
            
            this.dragType = detectedType;
            if (this.dragType) {
                this.dragState = {
                    startMouseX: worldMx, startMouseY: worldMy,
                    startX: this.overlay.x, startY: this.overlay.y,
                    startW: this.overlay.width, startH: this.overlay.height,
                    startRotation: this.overlay.rotation,
                    aspect: this.overlay.width / this.overlay.height,
                    featherStartX: this.featherCenter.x, featherStartY: this.featherCenter.y,
                    viewScale: frozenScale, viewOffsetX: frozenOffsetX, viewOffsetY: frozenOffsetY,
                    startDist: ['scale-tl', 'scale-tr', 'scale-bl', 'scale-br'].includes(detectedType) 
                        ? Math.hypot(worldMx - this.overlay.x, worldMy - this.overlay.y) 
                        : 0
                };
                return true;
            }
            
            const dx = worldMx - this.overlay.x, dy = worldMy - this.overlay.y;
            const rotRad = -this.overlay.rotation * Math.PI / 180;
            const localX = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
            const localY = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
            const flipX = this.overlay.flipH ? -1 : 1, flipY = this.overlay.flipV ? -1 : 1;
            const adjustedX = localX * flipX, adjustedY = localY * flipY;
            
            if (Math.abs(adjustedX) < this.overlay.width / 2 && Math.abs(adjustedY) < this.overlay.height / 2) {
                this.dragType = 'move';
                this.dragState = {
                    startMouseX: worldMx, startMouseY: worldMy,
                    startX: this.overlay.x, startY: this.overlay.y,
                    startW: this.overlay.width, startH: this.overlay.height,
                    startRotation: this.overlay.rotation,
                    viewScale: frozenScale, viewOffsetX: frozenOffsetX, viewOffsetY: frozenOffsetY,
                };
                return true;
            }
            
            const btnW = (this.size[0]-50)/2, btnH = 30, gap = 10;
            const y2 = this.size[1] - btnH - 15, y1 = y2 - btnH - gap;
            if (mx >= 15 && mx <= 15+btnW && my >= y1 && my <= y1+btnH) { this.overlay.flipH = !this.overlay.flipH; this.updateRelativeFromAbsolute(); this.setDirtyCanvas(true); return true; }
            if (mx >= 15+btnW+gap && mx <= 15+btnW+gap+btnW && my >= y1 && my <= y1+btnH) { this.overlay.flipV = !this.overlay.flipV; this.updateRelativeFromAbsolute(); this.setDirtyCanvas(true); return true; }
            if (mx >= 15 && mx <= 15+btnW && my >= y2 && my <= y2+btnH) { this.sendTransforms(); return true; }
            if (mx >= 15+btnW+gap && mx <= 15+btnW+gap+btnW && my >= y2 && my <= y2+btnH) { this.cancelEditing(); return true; }
            return false;
        };

        nodeType.prototype.onMouseMove = function(event, pos) {
            const { cSize, rectX, rectY } = this.getCanvasMetrics();
            const mx = pos[0], my = pos[1];
            
            const btnW = (this.size[0]-50)/2, btnH = 30, gap = 10;
            const y2 = this.size[1] - btnH - 15, y1 = y2 - btnH - gap;
            const prev = [this.btnFlipHHover, this.btnFlipVHover, this.btnApplyHover, this.btnCancelHover];
            this.btnFlipHHover = mx >= 15 && mx <= 15+btnW && my >= y1 && my <= y1+btnH;
            this.btnFlipVHover = mx >= 15+btnW+gap && mx <= 15+btnW+gap+btnW && my >= y1 && my <= y1+btnH;
            this.btnApplyHover = mx >= 15 && mx <= 15+btnW && my >= y2 && my <= y2+btnH;
            this.btnCancelHover = mx >= 15+btnW+gap && mx <= 15+btnW+gap+btnW && my >= y2 && my <= y2+btnH;
            if (prev.some((v,i) => v !== [this.btnFlipHHover, this.btnFlipVHover, this.btnApplyHover, this.btnCancelHover][i])) this.setDirtyCanvas(true);
            
            if (!this.dragType || !this.isEditing || this.isLoading || !this.dragState) return;
            
            const worldMx = (mx - rectX - this.dragState.viewOffsetX) / this.dragState.viewScale;
            const worldMy = (my - rectY - this.dragState.viewOffsetY) / this.dragState.viewScale;
            const dx = worldMx - this.dragState.startMouseX, dy = worldMy - this.dragState.startMouseY;

            switch(this.dragType) {
                case 'move': 
                    this.overlay.x = this.dragState.startX + dx; this.overlay.y = this.dragState.startY + dy; break;
                case 'rotate': { 
                    const cx = this.overlay.x, cy = this.overlay.y;
                    const startAngle = Math.atan2(this.dragState.startMouseY - cy, this.dragState.startMouseX - cx);
                    const currentAngle = Math.atan2(worldMy - cy, worldMx - cx);
                    this.overlay.rotation = this.dragState.startRotation + (currentAngle - startAngle) * 180 / Math.PI;
                    break; 
                }
                case 'scale-br': case 'scale-bl': case 'scale-tr': case 'scale-tl': {
                    const currentDist = Math.hypot(worldMx - this.overlay.x, worldMy - this.overlay.y);
                    const startDist = this.dragState.startDist || 1;
                    const scale = Math.max(0.05, currentDist / startDist);

                    this.overlay.width = Math.max(40, this.dragState.startW * scale);
                    this.overlay.height = Math.max(40, this.dragState.startH * scale);
                    this.overlay.x = this.dragState.startX;
                    this.overlay.y = this.dragState.startY;
                    break;
                }
                case 'scale-r': case 'scale-l': case 'scale-b': case 'scale-t': {
                    const angleRad = this.dragState.startRotation * Math.PI / 180;
                    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
                    const localDx = dx * cos + dy * sin;
                    const localDy = -dx * sin + dy * cos;

                    let finalW = this.dragState.startW, finalH = this.dragState.startH;

                    switch(this.dragType) {
                        case 'scale-r': finalW += localDx; break;
                        case 'scale-l': finalW -= localDx; break;
                        case 'scale-b': finalH += localDy; break;
                        case 'scale-t': finalH -= localDy; break;
                    }
                    
                    if (finalW < 40) finalW = 40; if (finalH < 40) finalH = 40;

                    this.overlay.width = finalW; this.overlay.height = finalH;
                    this.overlay.x = this.dragState.startX;
                    this.overlay.y = this.dragState.startY;
                    break;
                }
                case 'feather-center': {
                    const rad = -this.dragState.startRotation * Math.PI / 180;
                    const cos = Math.cos(rad), sin = Math.sin(rad);
                    const rdx = dx * cos - dy * sin, rdy = dx * sin + dy * cos;
                    this.featherCenter.x = Math.max(0, Math.min(1, this.dragState.featherStartX + rdx / this.dragState.startW));
                    this.featherCenter.y = Math.max(0, Math.min(1, this.dragState.featherStartY + rdy / this.dragState.startH));
                    this.previewDirty = true; break; 
                }
            }
            this.setDirtyCanvas(true);
        };

        nodeType.prototype.onMouseUp = function() { 
            if (this.dragType) { this.updateRelativeFromAbsolute(); this.computeAndApplyView(); }
            this.dragType = null; this.dragState = null;
        };
    }
});