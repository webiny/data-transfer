import { createFeature } from "../../base/index.js";
import { DroppedRecordLog } from "./DroppedRecordLog.js";
export const DroppedRecordLogFeature = createFeature({
  name: "Core/DroppedRecordLogFeature",
  register(container) {
    container.register(DroppedRecordLog).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
