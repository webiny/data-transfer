import { createFeature } from "../../base/index.js";
import { TransferredRecordLog } from "./TransferredRecordLog.js";
export const TransferredRecordLogFeature = createFeature({
  name: "Core/TransferredRecordLogFeature",
  register(container) {
    container.register(TransferredRecordLog).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
