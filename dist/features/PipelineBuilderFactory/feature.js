import { createFeature } from "../../base/index.js";
import { PipelineBuilderFactory } from "./PipelineBuilderFactory.js";
export const PipelineBuilderFactoryFeature = createFeature({
  name: "Core/PipelineBuilderFactoryFeature",
  register(container) {
    container.register(PipelineBuilderFactory).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
