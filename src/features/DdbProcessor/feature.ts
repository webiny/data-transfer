import { createFeature } from "~/base/index.ts";
import { DdbProcessor } from "./DdbProcessor.ts";

export const DdbProcessorFeature = createFeature({
    name: "Core/DdbProcessorFeature",
    register(container) {
        container.register(DdbProcessor).inSingletonScope();
    }
});
