import type { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.js";
import { BeforeLoadPresetHook } from "./abstractions/PresetLifecycle.ts";

export type { IBeforeLoadPresetHook } from "./abstractions/PresetLifecycle.js";

class BeforeLoadPresetHookCompositeImpl implements BeforeLoadPresetHook.Interface {
    public constructor(private readonly hooks: BeforeLoadPresetHook.Interface[]) {}

    public async execute(config: MigrationConfig.Interface): Promise<void> {
        for (const hook of this.hooks) {
            await hook.execute(config);
        }
    }
}

export const BeforeLoadPresetHookComposite = BeforeLoadPresetHook.createComposite({
    implementation: BeforeLoadPresetHookCompositeImpl,
    dependencies: [[BeforeLoadPresetHook, { multiple: true }]]
});
