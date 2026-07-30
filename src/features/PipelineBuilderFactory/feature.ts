import { createFeature } from "~/base/index.js";
import { PipelineBuilderFactory } from "./PipelineBuilderFactory.ts";

export const PipelineBuilderFactoryFeature = createFeature({
    name: "Core/PipelineBuilderFactoryFeature",
    register(container) {
        container.register(PipelineBuilderFactory).inSingletonScope();
    }
});
