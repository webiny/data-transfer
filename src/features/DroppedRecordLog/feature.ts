import { createFeature } from "~/base/index.ts";
import { DroppedRecordLog } from "./DroppedRecordLog.ts";

export const DroppedRecordLogFeature = createFeature({
    name: "Core/DroppedRecordLogFeature",
    register(container) {
        container.register(DroppedRecordLog).inSingletonScope();
    }
});
