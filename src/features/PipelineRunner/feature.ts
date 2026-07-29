import { createFeature } from "~/base/index.js";
import { PipelineRunner } from "./PipelineRunner.ts";

export const PipelineRunnerFeature = createFeature({
    name: "Core/PipelineRunnerFeature",
    register(container) {
        container.register(PipelineRunner).inSingletonScope();
    }
});
