import { BeforeLoadPresetHook } from "./abstractions/PresetLifecycle.js";
class BeforeLoadPresetHookCompositeImpl {
  hooks;
  constructor(hooks) {
    this.hooks = hooks;
  }
  async execute(config) {
    for (const hook of this.hooks) {
      await hook.execute(config);
    }
  }
}
export const BeforeLoadPresetHookComposite = BeforeLoadPresetHook.createComposite({
  implementation: BeforeLoadPresetHookCompositeImpl,
  dependencies: [[BeforeLoadPresetHook, { multiple: true }]]
});
//# sourceMappingURL=BeforeLoadPresetHookComposite.js.map
