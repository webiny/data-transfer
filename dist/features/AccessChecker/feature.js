import { createFeature } from "../../base/index.js";
import { AccessChecker } from "./AccessChecker.js";
export const AccessCheckerFeature = createFeature({
  name: "Core/AccessCheckerFeature",
  register(container) {
    container.register(AccessChecker).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
