import type { MigrationConfig } from "../../../features/MigrationConfig/abstractions/MigrationConfig.js";
import type { MigrationPreset } from "../../../domain/transform/Preset.js";
export interface IBeforeLoadPresetHook {
  execute(config: MigrationConfig.Interface): Promise<void>;
}
export interface IAfterLoadPresetHook {
  execute(config: MigrationConfig.Interface, preset: MigrationPreset): Promise<void>;
}
export declare const BeforeLoadPresetHook: import("@webiny/di").Abstraction<IBeforeLoadPresetHook>;
export declare const AfterLoadPresetHook: import("@webiny/di").Abstraction<IAfterLoadPresetHook>;
export declare namespace BeforeLoadPresetHook {
  type Interface = IBeforeLoadPresetHook;
}
export declare namespace AfterLoadPresetHook {
  type Interface = IAfterLoadPresetHook;
}
//# sourceMappingURL=PresetLifecycle.d.ts.map
