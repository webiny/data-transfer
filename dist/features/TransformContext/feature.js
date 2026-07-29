import { createFeature } from "../../base/index.js";
import { BaseTransformContextFactory } from "./BaseTransformContextFactory.js";
export const TransformContextFeature = createFeature({
  name: "Core/TransformContextFeature",
  register(container) {
    container.register(BaseTransformContextFactory).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
