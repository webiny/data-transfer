import type { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import { TenantLocales } from "~/features/TenantLocales/index.ts";
import { ModelProvider } from "~/features/ModelProvider/index.ts";
import { AfterLoadPresetHook } from "./abstractions/PresetLifecycle.ts";

class ModelPreloaderHookImpl implements AfterLoadPresetHook.Interface {
    public constructor(
        private readonly tenantLocales: TenantLocales.Interface,
        private readonly modelProvider: ModelProvider.Interface
    ) {}

    public async execute(
        _config: MigrationConfig.Interface,
        _preset: MigrationPreset
    ): Promise<void> {
        await this.tenantLocales.preload();
        const map = this.tenantLocales.getMap();
        await this.modelProvider.preloadModels(map);
    }
}

export const ModelPreloaderHook = AfterLoadPresetHook.createImplementation({
    implementation: ModelPreloaderHookImpl,
    dependencies: [TenantLocales, ModelProvider]
});
