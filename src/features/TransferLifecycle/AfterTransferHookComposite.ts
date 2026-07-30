import { AfterTransferHook } from "./abstractions/TransferLifecycle.ts";

export type { IAfterTransferHook } from "./abstractions/TransferLifecycle.js";

class AfterTransferHookCompositeImpl implements AfterTransferHook.Interface {
    public constructor(private readonly hooks: AfterTransferHook.Interface[]) {}

    public async execute(): Promise<void> {
        for (const hook of this.hooks) {
            await hook.execute();
        }
    }
}

export const AfterTransferHookComposite = AfterTransferHook.createComposite({
    implementation: AfterTransferHookCompositeImpl,
    dependencies: [[AfterTransferHook, { multiple: true }]]
});
