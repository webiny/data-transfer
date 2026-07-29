import { createFeature } from "../../base/index.js";
import { BeforeTransferHookComposite } from "./BeforeTransferHookComposite.js";
import { AfterTransferHookComposite } from "./AfterTransferHookComposite.js";
export const TransferLifecycleFeature = createFeature({
  name: "Transfer/TransferLifecycleFeature",
  register(container) {
    container.registerComposite(BeforeTransferHookComposite);
    container.registerComposite(AfterTransferHookComposite);
  }
});
//# sourceMappingURL=feature.js.map
