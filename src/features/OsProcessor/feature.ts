import { createFeature } from "~/base/index.ts";
import { OsProcessor } from "./OsProcessor.ts";
import { OsIndexPrefixHook } from "./OsIndexPrefixHook.ts";

export const OsProcessorFeature = createFeature({
    name: "Core/OsProcessorFeature",
    register(container) {
        container.register(OsProcessor).inSingletonScope();
        container.register(OsIndexPrefixHook);
    }
});
