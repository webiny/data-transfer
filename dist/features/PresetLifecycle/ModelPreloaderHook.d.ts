import type { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import type { MigrationPreset } from "../../domain/transform/Preset.js";
import { TenantLocales } from "../../features/TenantLocales/index.js";
import { ModelProvider } from "../../features/ModelProvider/index.js";
import { AfterLoadPresetHook } from "./abstractions/PresetLifecycle.ts";
export type { IAfterLoadPresetHook } from "./abstractions/PresetLifecycle.js";
declare class ModelPreloaderHookImpl implements AfterLoadPresetHook.Interface {
  private readonly tenantLocales;
  private readonly modelProvider;
  constructor(tenantLocales: TenantLocales.Interface, modelProvider: ModelProvider.Interface);
  execute(_config: MigrationConfig.Interface, _preset: MigrationPreset): Promise<void>;
}
export declare const ModelPreloaderHook: typeof ModelPreloaderHookImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/PresetLifecycle.ts").IAfterLoadPresetHook
  >;
};
//# sourceMappingURL=ModelPreloaderHook.d.ts.map
