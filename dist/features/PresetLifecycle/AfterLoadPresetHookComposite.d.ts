import type { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import type { MigrationPreset } from "../../domain/transform/Preset.js";
import { AfterLoadPresetHook } from "./abstractions/PresetLifecycle.ts";
export type { IAfterLoadPresetHook } from "./abstractions/PresetLifecycle.js";
declare class AfterLoadPresetHookCompositeImpl implements AfterLoadPresetHook.Interface {
  private readonly hooks;
  constructor(hooks: AfterLoadPresetHook.Interface[]);
  execute(config: MigrationConfig.Interface, preset: MigrationPreset): Promise<void>;
}
export declare const AfterLoadPresetHookComposite: typeof AfterLoadPresetHookCompositeImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/PresetLifecycle.ts").IAfterLoadPresetHook
  >;
};
//# sourceMappingURL=AfterLoadPresetHookComposite.d.ts.map
