import { createFeature } from "~/base/index.js";
import { S3Processor } from "./S3Processor.ts";

export const S3ProcessorFeature = createFeature({
    name: "Core/S3ProcessorFeature",
    register(container) {
        container.register(S3Processor).inSingletonScope();
    }
});
