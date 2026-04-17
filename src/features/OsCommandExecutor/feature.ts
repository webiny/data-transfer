import { createFeature } from "~/base/index.ts";
import { OsCommandExecutor } from "./OsCommandExecutor.ts";

export const OsCommandExecutorFeature = createFeature({
    name: "Core/OsCommandExecutorFeature",
    register(container) {
        container.register(OsCommandExecutor).inSingletonScope();
    }
});
