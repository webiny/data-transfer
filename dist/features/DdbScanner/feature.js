import { createFeature } from "../../base/index.js";
import { DdbScanner } from "./DdbScanner.js";
export const DdbScannerFeature = createFeature({
  name: "Core/DdbScannerFeature",
  register(container) {
    container.register(DdbScanner).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
