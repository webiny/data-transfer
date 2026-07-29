import type { MigrationPreset } from "../../domain/transform/Preset.js";
import { PresetLoader as PresetLoaderAbstraction } from "./abstractions/PresetLoader.ts";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
export type { IPresetLoader } from "./abstractions/PresetLoader.js";
declare class PresetLoaderImpl implements PresetLoaderAbstraction.Interface {
  private readonly logger;
  private readonly dirTool;
  private readonly fileTool;
  private readonly config;
  constructor(
    logger: Logger.Interface,
    dirTool: DirectoryTool.Interface,
    fileTool: FileTool.Interface,
    config: MigrationConfig.Interface
  );
  load(presetNameOrPath: string): Promise<MigrationPreset>;
  getBuiltInPresets(): string[];
  private resolvePresetPath;
  private findBuiltInPath;
  private findUserPresetPath;
  private getUserPresets;
  private stripPresetExtension;
}
export declare const PresetLoader: typeof PresetLoaderImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/PresetLoader.ts").IPresetLoader
  >;
};
//# sourceMappingURL=PresetLoader.d.ts.map
