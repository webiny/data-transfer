import { createFeature } from "@/src/base/index.ts";
import { DirectoryTool } from "./DirectoryTool.ts";

export const DirectoryToolFeature = createFeature({
    name: "Core/DirectoryToolFeature",
    register(container) {
        container.register(DirectoryTool).inSingletonScope();
    }
});
