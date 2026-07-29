import { createFeature } from "../../base/index.js";
import { DirectoryTool } from "./DirectoryTool.js";
export const DirectoryToolFeature = createFeature({
  name: "Core/DirectoryToolFeature",
  register(container) {
    container.register(DirectoryTool).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
