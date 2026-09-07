import { createFeature } from "~/base/index.js";
import { ClackPrompts } from "./ClackPrompts.ts";
import { ClackUI } from "./ClackUI.ts";

export const PromptsFeature = createFeature({
    name: "Cli/PromptsFeature",
    register(container) {
        container.register(ClackPrompts).inSingletonScope();
        container.register(ClackUI).inSingletonScope();
    }
});
