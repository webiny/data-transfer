import { createAbstraction } from "~/base/index.js";
import type { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.js";
import type { MigrationPreset } from "~/domain/transform/Preset.js";

export interface IBeforeLoadPresetHook {
    execute(config: MigrationConfig.Interface): Promise<void>;
}

export interface IAfterLoadPresetHook {
    execute(config: MigrationConfig.Interface, preset: MigrationPreset): Promise<void>;
}

export const BeforeLoadPresetHook = createAbstraction<IBeforeLoadPresetHook>(
    "Transfer/BeforeLoadPresetHook"
);

export const AfterLoadPresetHook = createAbstraction<IAfterLoadPresetHook>(
    "Transfer/AfterLoadPresetHook"
);

export namespace BeforeLoadPresetHook {
    export type Interface = IBeforeLoadPresetHook;
}

export namespace AfterLoadPresetHook {
    export type Interface = IAfterLoadPresetHook;
}
