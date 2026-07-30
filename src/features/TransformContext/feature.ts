import { createFeature } from "~/base/index.js";
import { BaseTransformContextFactory } from "./BaseTransformContextFactory.ts";

export const TransformContextFeature = createFeature({
    name: "Core/TransformContextFeature",
    register(container) {
        container.register(BaseTransformContextFactory).inSingletonScope();
    }
});
