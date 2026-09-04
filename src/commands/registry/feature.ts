import { createFeature } from "~/base/index.js";
import { CommandRegistry } from "./CommandRegistry.ts";

export const CommandRegistryFeature = createFeature({
    name: "Cli/CommandRegistryFeature",
    register(container) {
        container.register(CommandRegistry).inSingletonScope();
    }
});
