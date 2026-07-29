import type { MigrationPreset } from "../../../domain/transform/Preset.js";
export interface IPresetLoader {
  load(presetNameOrPath: string): Promise<MigrationPreset>;
  getBuiltInPresets(): string[];
}
export declare const PresetLoader: import("@webiny/di").Abstraction<IPresetLoader>;
export declare namespace PresetLoader {
  type Interface = IPresetLoader;
}
//# sourceMappingURL=PresetLoader.d.ts.map
