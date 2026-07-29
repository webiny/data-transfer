import { BeforeTransferHook } from "./abstractions/TransferLifecycle.js";
class BeforeTransferHookCompositeImpl {
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
export const BeforeTransferHookComposite = BeforeTransferHook.createComposite({
  implementation: BeforeTransferHookCompositeImpl,
  dependencies: [[BeforeTransferHook, { multiple: true }]]
});
//# sourceMappingURL=BeforeTransferHookComposite.js.map
