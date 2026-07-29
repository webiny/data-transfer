import { createFeature } from "../../base/index.js";
import { WorkerSpawner } from "./WorkerSpawner.js";
export const WorkerSpawnerFeature = createFeature({
  name: "Core/WorkerSpawnerFeature",
  register(container) {
    container.register(WorkerSpawner).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
