import { BeforeTransferHook } from "./abstractions/TransferLifecycle.ts";

class BeforeTransferHookCompositeImpl implements BeforeTransferHook.Interface {
    public constructor(private readonly hooks: BeforeTransferHook.Interface[]) {}

    public async execute(): Promise<void> {
        for (const hook of this.hooks) {
            await hook.execute();
        }
    }
}

export const BeforeTransferHookComposite = BeforeTransferHook.createComposite({
    implementation: BeforeTransferHookCompositeImpl,
    dependencies: [[BeforeTransferHook, { multiple: true }]]
});
