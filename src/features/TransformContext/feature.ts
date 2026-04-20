import { createFeature } from "~/base/index.ts";
import { BaseTransformContextFactory } from "./BaseTransformContextFactory.ts";

export const TransformContextFeature = createFeature({
    name: "Core/TransformContextFeature",
    register(container) {
        container.register(BaseTransformContextFactory).inSingletonScope();
    }
});
