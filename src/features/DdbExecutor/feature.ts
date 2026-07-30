import { createFeature } from "~/base/index.js";
import { DdbExecutor } from "./DdbExecutor.ts";

export const DdbExecutorFeature = createFeature({
    name: "Core/DdbExecutorFeature",
    register(container) {
        container.register(DdbExecutor).inSingletonScope();
    }
});
