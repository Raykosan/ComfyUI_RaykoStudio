import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.LoopSwitchSeed",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RaykoLoopSwitchSeed") {
            
            nodeType.prototype.onExecuted = function(message) {
                const uiData = message.ui || message;
                
                if (!this.widgets || !uiData) {
                    return;
                }
                
                for (let i = 1; i <= 10; i++) {
                    const widgetName = "value_" + i;
                    const widget = this.widgets.find(w => w.name === widgetName);
                    
                    if (widget && uiData[widgetName]) {
                        widget.value = uiData[widgetName][0];
                    }
                }
                
                this.setDirtyCanvas(true, true);
            };
        }
    }
});