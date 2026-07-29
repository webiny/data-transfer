import type { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { BeforeLoadPresetHook } from "./abstractions/PresetLifecycle.ts";
export type { IBeforeLoadPresetHook } from "./abstractions/PresetLifecycle.js";
declare class BeforeLoadPresetHookCompositeImpl implements BeforeLoadPresetHook.Interface {
  private readonly hooks;
  constructor(hooks: BeforeLoadPresetHook.Interface[]);
  execute(config: MigrationConfig.Interface): Promise<void>;
}
export declare const BeforeLoadPresetHookComposite: typeof BeforeLoadPresetHookCompositeImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/PresetLifecycle.ts").IBeforeLoadPresetHook
  >;
};
//# sourceMappingURL=BeforeLoadPresetHookComposite.d.ts.map
