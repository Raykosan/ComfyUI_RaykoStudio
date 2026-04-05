import { app } from "/scripts/app.js";

app.registerExtension({
    name: "RaykoStudio.LastFrameSize",
    nodeCreated(node) {
        if (node.comfyClass === "RS_Last_Frame") {
            node.setSize([200, 40]);
        }
    }
});