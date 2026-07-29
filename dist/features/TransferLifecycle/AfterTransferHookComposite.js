import { AfterTransferHook } from "./abstractions/TransferLifecycle.js";
class AfterTransferHookCompositeImpl {
  hooks;
  constructor(hooks) {
    this.hooks = hooks;
  }
  async execute() {
    for (const hook of this.hooks) {
      await hook.execute();
    }
  }
}
export const AfterTransferHookComposite = AfterTransferHook.createComposite({
  implementation: AfterTransferHookCompositeImpl,
  dependencies: [[AfterTransferHook, { multiple: true }]]
});
//# sourceMappingURL=AfterTransferHookComposite.js.map
