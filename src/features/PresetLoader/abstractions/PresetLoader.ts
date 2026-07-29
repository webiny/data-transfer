import { createAbstraction } from "~/base/index.js";
import type { MigrationPreset } from "~/domain/transform/Preset.js";

interface IPresetLoader {
    load(presetNameOrPath: string): Promise<MigrationPreset>;
    getBuiltInPresets(): string[];
}

export const PresetLoader = createAbstraction<IPresetLoader>("Core/PresetLoader");

export namespace PresetLoader {
    export type Interface = IPresetLoader;
}
