import { AfterLoadPresetHook } from "./abstractions/PresetLifecycle.js";
class AfterLoadPresetHookCompositeImpl {
  hooks;
  constructor(hooks) {
    this.hooks = hooks;
  }
  async execute(config, preset) {
    for (const hook of this.hooks) {
      await hook.execute(config, preset);
    }
  }
}
export const AfterLoadPresetHookComposite = AfterLoadPresetHook.createComposite({
  implementation: AfterLoadPresetHookCompositeImpl,
  dependencies: [[AfterLoadPresetHook, { multiple: true }]]
});
//# sourceMappingURL=AfterLoadPresetHookComposite.js.map
