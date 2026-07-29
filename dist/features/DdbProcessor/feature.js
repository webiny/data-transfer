import { createFeature } from "../../base/index.js";
import { DdbProcessor } from "./DdbProcessor.js";
export const DdbProcessorFeature = createFeature({
  name: "Core/DdbProcessorFeature",
  register(container) {
    container.register(DdbProcessor).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
