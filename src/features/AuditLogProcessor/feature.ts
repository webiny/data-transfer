import { createFeature } from "~/base/index.ts";
import { AuditLogProcessor } from "./AuditLogProcessor.ts";

export const AuditLogProcessorFeature = createFeature({
    name: "Core/AuditLogProcessorFeature",
    register(container) {
        container.register(AuditLogProcessor).inSingletonScope();
    }
});
