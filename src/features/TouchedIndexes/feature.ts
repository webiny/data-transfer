import { createFeature } from "~/base/index.ts";
import { TouchedIndexes } from "./TouchedIndexes.ts";

export const TouchedIndexesFeature = createFeature({
    name: "Core/TouchedIndexesFeature",
    register(container) {
        container.register(TouchedIndexes).inSingletonScope();
    }
});
