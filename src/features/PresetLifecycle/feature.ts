import { createFeature } from "~/base/index.ts";
import { BeforeLoadPresetHookComposite } from "./BeforeLoadPresetHookComposite.ts";
import { AfterLoadPresetHookComposite } from "./AfterLoadPresetHookComposite.ts";
import { ModelPreloaderHook } from "./ModelPreloaderHook.ts";

export const PresetLifecycleFeature = createFeature({
    name: "Transfer/PresetLifecycleFeature",
    register(container) {
        container.register(ModelPreloaderHook);
        container.registerComposite(BeforeLoadPresetHookComposite);
        container.registerComposite(AfterLoadPresetHookComposite);
    }
});
