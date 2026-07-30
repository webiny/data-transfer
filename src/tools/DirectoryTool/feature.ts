import { createFeature } from "~/base/index.js";
import { DirectoryTool } from "./DirectoryTool.ts";

export const DirectoryToolFeature = createFeature({
    name: "Core/DirectoryToolFeature",
    register(container) {
        container.register(DirectoryTool).inSingletonScope();
    }
});
