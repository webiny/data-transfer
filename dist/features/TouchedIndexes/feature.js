import { createFeature } from "../../base/index.js";
import { TouchedIndexes } from "./TouchedIndexes.js";
export const TouchedIndexesFeature = createFeature({
  name: "Core/TouchedIndexesFeature",
  register(container) {
    container.register(TouchedIndexes).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
