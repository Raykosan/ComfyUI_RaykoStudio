import { app } from "../../scripts/app.js";

const NODE_NAME = "SplitVideoAudio";
const NODE_WIDTH = 220;

app.registerExtension({
    name: "RaykoStudio.SplitVideoAudio.Width",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            this.minWidth = NODE_WIDTH;

            const height = this.size?.[1] ?? this.computeSize()[1];
            this.setSize([NODE_WIDTH, height]);
        };

        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function (size) {
            if (size[0] < NODE_WIDTH) size[0] = NODE_WIDTH;
            return onResize?.apply(this, arguments);
        };
    },
});