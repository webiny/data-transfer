import { createFeature } from "~/base/index.ts";
import { FileTool } from "./FileTool.ts";

export const FileToolFeature = createFeature({
    name: "Core/FileToolFeature",
    register(container) {
        container.register(FileTool).inSingletonScope();
    }
});
