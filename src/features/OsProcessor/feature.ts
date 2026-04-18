import { createFeature } from "~/base/index.ts";
import { OsProcessor } from "./OsProcessor.ts";

export const OsProcessorFeature = createFeature({
    name: "Core/OsProcessorFeature",
    register(container) {
        container.register(OsProcessor).inSingletonScope();
    }
});
