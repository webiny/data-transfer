import { createFeature } from "~/base/index.js";
import { FileTool } from "./FileTool.ts";

export const FileToolFeature = createFeature({
    name: "Core/FileToolFeature",
    register(container) {
        container.register(FileTool).inSingletonScope();
    }
});
