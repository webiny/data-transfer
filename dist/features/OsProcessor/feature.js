import { createFeature } from "../../base/index.js";
import { OsProcessor } from "./OsProcessor.js";
import { OsIndexPrefixHook } from "./OsIndexPrefixHook.js";
export const OsProcessorFeature = createFeature({
  name: "Core/OsProcessorFeature",
  register(container) {
    container.register(OsProcessor).inSingletonScope();
    container.register(OsIndexPrefixHook);
  }
});
//# sourceMappingURL=feature.js.map
