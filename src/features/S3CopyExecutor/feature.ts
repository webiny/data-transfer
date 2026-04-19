import { createFeature } from "~/base/index.ts";
import { S3CopyExecutor } from "./S3CopyExecutor.ts";

export const S3CopyExecutorFeature = createFeature({
    name: "Core/S3CopyExecutorFeature",
    register(container) {
        container.register(S3CopyExecutor).inSingletonScope();
    }
});
