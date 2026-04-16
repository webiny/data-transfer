import { createAbstraction } from "@/src/base/index.ts";
import type { MigrationPreset } from "@/src/core/types.ts";

interface IPresetLoader {
    load(presetNameOrPath: string): Promise<MigrationPreset>;
    getBuiltInPresets(): string[];
}

export const PresetLoader = createAbstraction<IPresetLoader>("Core/PresetLoader");

export namespace PresetLoader {
    export type Interface = IPresetLoader;
}
