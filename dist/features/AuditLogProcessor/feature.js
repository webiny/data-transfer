import { createFeature } from "../../base/index.js";
import { AuditLogProcessor } from "./AuditLogProcessor.js";
export const AuditLogProcessorFeature = createFeature({
  name: "Core/AuditLogProcessorFeature",
  register(container) {
    container.register(AuditLogProcessor).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
