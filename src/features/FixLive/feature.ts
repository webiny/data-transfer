import { createFeature } from "~/base/index.js";
import { LiveFieldReconciler } from "./LiveFieldReconciler.ts";
import { ChangeReport } from "./ChangeReport.ts";
import { FixLiveState } from "./FixLiveState.ts";

export const FixLiveFeature = createFeature({
    name: "FixLive/FixLiveFeature",
    register(container) {
        container.register(LiveFieldReconciler).inSingletonScope();
        container.register(ChangeReport).inSingletonScope();
        container.register(FixLiveState).inSingletonScope();
    }
});
