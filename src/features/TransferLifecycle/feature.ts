import { createFeature } from "~/base/index.js";
import { BeforeTransferHookComposite } from "./BeforeTransferHookComposite.ts";
import { AfterTransferHookComposite } from "./AfterTransferHookComposite.ts";

export const TransferLifecycleFeature = createFeature({
    name: "Transfer/TransferLifecycleFeature",
    register(container) {
        container.registerComposite(BeforeTransferHookComposite);
        container.registerComposite(AfterTransferHookComposite);
    }
});
