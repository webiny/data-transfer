import { createFeature } from "../../base/index.js";
import { PipelineRunner } from "./PipelineRunner.js";
export const PipelineRunnerFeature = createFeature({
  name: "Core/PipelineRunnerFeature",
  register(container) {
    container.register(PipelineRunner).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
