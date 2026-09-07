import { createFeature } from "~/base/index.js";
import { FixLiveCommand } from "./FixLiveCommand.ts";

export const FixLiveCommandFeature = createFeature({
    name: "Cli/FixLiveCommandFeature",
    register(container) {
        container.register(FixLiveCommand).inSingletonScope();
    }
});
