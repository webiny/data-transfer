import { createFeature } from "~/base/index.ts";
import { TransferredRecordLog } from "./TransferredRecordLog.ts";

export const TransferredRecordLogFeature = createFeature({
    name: "Core/TransferredRecordLogFeature",
    register(container) {
        container.register(TransferredRecordLog).inSingletonScope();
    }
});
