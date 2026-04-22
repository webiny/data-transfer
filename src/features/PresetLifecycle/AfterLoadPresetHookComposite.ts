import type { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import { AfterLoadPresetHook } from "./abstractions/PresetLifecycle.ts";

class AfterLoadPresetHookCompositeImpl implements AfterLoadPresetHook.Interface {
    public constructor(private readonly hooks: AfterLoadPresetHook.Interface[]) {}

    public async execute(
        config: MigrationConfig.Interface,
        preset: MigrationPreset
    ): Promise<void> {
        for (const hook of this.hooks) {
            await hook.execute(config, preset);
        }
    }
}

export const AfterLoadPresetHookComposite = AfterLoadPresetHook.createComposite({
    implementation: AfterLoadPresetHookCompositeImpl,
    dependencies: [[AfterLoadPresetHook, { multiple: true }]]
});
