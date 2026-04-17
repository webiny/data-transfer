import { createFeature } from "~/base/index.ts";
import { DdbCommandExecutor } from "./DdbCommandExecutor.ts";

export const DdbCommandExecutorFeature = createFeature({
    name: "Core/DdbCommandExecutorFeature",
    register(container) {
        container.register(DdbCommandExecutor).inSingletonScope();
    }
});
