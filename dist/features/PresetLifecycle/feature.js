import { createFeature } from "../../base/index.js";
import { BeforeLoadPresetHookComposite } from "./BeforeLoadPresetHookComposite.js";
import { AfterLoadPresetHookComposite } from "./AfterLoadPresetHookComposite.js";
import { ModelPreloaderHook } from "./ModelPreloaderHook.js";
export const PresetLifecycleFeature = createFeature({
  name: "Transfer/PresetLifecycleFeature",
  register(container) {
    container.register(ModelPreloaderHook);
    container.registerComposite(BeforeLoadPresetHookComposite);
    container.registerComposite(AfterLoadPresetHookComposite);
  }
});
//# sourceMappingURL=feature.js.map
