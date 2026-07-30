import { createFeature } from "~/base/index.js";
import { AccessChecker } from "./AccessChecker.ts";

export const AccessCheckerFeature = createFeature({
    name: "Core/AccessCheckerFeature",
    register(container) {
        container.register(AccessChecker).inSingletonScope();
    }
});
