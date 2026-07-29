import { createFeature } from "../../base/index.js";
import { OsScanner } from "./OsScanner.js";
export const OsScannerFeature = createFeature({
  name: "Core/OsScannerFeature",
  register(container) {
    container.register(OsScanner).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
