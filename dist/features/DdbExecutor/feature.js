import { createFeature } from "../../base/index.js";
import { DdbExecutor } from "./DdbExecutor.js";
export const DdbExecutorFeature = createFeature({
  name: "Core/DdbExecutorFeature",
  register(container) {
    container.register(DdbExecutor).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
