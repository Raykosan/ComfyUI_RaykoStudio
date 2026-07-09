import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.InsertCrop",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RSInsertCropImage") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            try {
                onNodeCreated?.apply(this, arguments);
                const node = this;
                
                node.currentStatus = "Ready";
                
                node.setSize([210, 100]);
                
                const cropDataWidget = node.widgets?.find(w => w.name === "crop_data");
                if (cropDataWidget) {
                    cropDataWidget.computeSize = function(w) {
                        return [w, 28];
                    };
                    
                    cropDataWidget.hidden = false;
                    
                    cropDataWidget.serializeValue = () => {
                        const value = cropDataWidget.value;
                        if (typeof value === 'string' && value.trim()) {
                            return value;
                        }
                        return "{}";
                    };
                }
                
                node.onResize = function(size) {
                    if (size[1] < 100) {
                        this.setSize([size[0], 100]);
                    }
                };
                
                node.onExecuted = function(message) {
                    this.currentStatus = "✅ Inserted";
                    this.setDirtyCanvas(true, true);
                };
                
                const onDrawForeground = node.onDrawForeground;
                node.onDrawForeground = function(ctx) {
                    if (!this.flags.collapsed) {
                        const [w, h] = this.size;
                        
                        ctx.fillStyle = "#888";
                        ctx.font = "11px Arial";
                        ctx.textAlign = "center";
                        ctx.fillText(this.currentStatus, w / 2, h - 20);
                    }
                };
                
            } catch (error) {
                console.error("[RS Insert Crop 🦊] Critical Error:", error);
            }
        };
    },
    
    setup(app) {
        app.api.addEventListener("executing", (event) => {
            const nodeId = event.detail;
            if (nodeId) {
                const node = app.graph.getNodeById(nodeId);
                if (node && node.comfyClass === "RSInsertCropImage") {
                    node.currentStatus = "⏳ Processing...";
                    node.setDirtyCanvas(true, true);
                }
            }
        });
    }
});