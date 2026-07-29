var __rewriteRelativeImportExtension =
  (this && this.__rewriteRelativeImportExtension) ||
  function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
      return path.replace(
        /\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i,
        function (m, tsx, d, ext, cm) {
          return tsx
            ? preserveJsx
              ? ".jsx"
              : ".js"
            : d && (!ext || !cm)
              ? m
              : d + ext + "." + cm.toLowerCase() + "js";
        }
      );
    }
    return path;
  };
import { dirname, isAbsolute, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PresetLoader as PresetLoaderAbstraction } from "./abstractions/PresetLoader.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { findPackageRoot } from "../../utils/findPackageRoot.js";
// Presets are compiled/copied alongside everything else, so they land at
// "<packageRoot>/presets" in the compiled (dist/) and published (npm)
// contexts, but stay nested under "src/" while running from source (tsx).
// Resolved lazily (not at module load) so importing this module doesn't
// require a real filesystem — tests that auto-mock "node:fs" still work.
let cachedBuiltInPresetsDir = null;
function getBuiltInPresetsDir() {
  if (cachedBuiltInPresetsDir) {
    return cachedBuiltInPresetsDir;
  }
  const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  cachedBuiltInPresetsDir = existsSync(join(packageRoot, "presets"))
    ? join(packageRoot, "presets")
    : join(packageRoot, "src", "presets");
  return cachedBuiltInPresetsDir;
}
const PRESET_EXTENSIONS = new Set([".ts", ".js"]);
class PresetLoaderImpl {
  logger;
  dirTool;
  fileTool;
  config;
  constructor(logger, dirTool, fileTool, config) {
    this.logger = logger;
    this.dirTool = dirTool;
    this.fileTool = fileTool;
    this.config = config;
  }
  async load(presetNameOrPath) {
    const presetPath = this.resolvePresetPath(presetNameOrPath);
    this.logger.info(`Loading preset from: ${presetPath}`);
    try {
      const presetModule = await import(
        __rewriteRelativeImportExtension(pathToFileURL(presetPath).href)
      );
      const preset = presetModule.default || presetModule.preset;
      if (!preset) {
        throw new Error(
          `Preset file "${presetPath}" does not export a preset.\n` +
            `Export a MigrationPreset as the default export or named "preset" export.`
        );
      }
      if (!preset.name || !preset.description || typeof preset.configure !== "function") {
        throw new Error(
          `Invalid preset structure in "${presetPath}".\n` +
            `A preset must have: name (string), description (string), and configure (function).`
        );
      }
      return preset;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot find module")) {
        throw new Error(
          `Failed to load preset from "${presetPath}".\n` +
            `Make sure the file exists and is a valid TypeScript/JavaScript module.`
        );
      }
      throw error;
    }
  }
  getBuiltInPresets() {
    const builtInPresetsDir = getBuiltInPresetsDir();
    if (!this.dirTool.exists(builtInPresetsDir)) {
      return [];
    }
    const entries = this.dirTool.readDir(builtInPresetsDir) ?? [];
    return entries
      .map(name => this.stripPresetExtension(name))
      .filter(name => name !== null)
      .sort();
  }
  resolvePresetPath(presetNameOrPath) {
    const builtInPath = this.findBuiltInPath(presetNameOrPath);
    if (builtInPath) {
      return builtInPath;
    }
    const presetsDir = this.config.pipeline?.presetsDir;
    if (presetsDir) {
      const userPath = this.findUserPresetPath(presetNameOrPath, presetsDir);
      if (userPath) {
        return userPath;
      }
    }
    if (presetNameOrPath.endsWith(".ts") || presetNameOrPath.endsWith(".js")) {
      const presetPath = isAbsolute(presetNameOrPath)
        ? presetNameOrPath
        : resolve(process.cwd(), presetNameOrPath);
      if (!this.fileTool.exists(presetPath)) {
        throw new Error(
          `Preset file not found: ${presetPath}\n` +
            `Make sure the file exists and the path is correct.`
        );
      }
      return presetPath;
    }
    const builtIns = this.getBuiltInPresets();
    const builtInHint =
      builtIns.length > 0 ? `Available built-in presets: ${builtIns.join(", ")}\n` : "";
    let userPresetsHint = "";
    if (presetsDir) {
      const userPresets = this.getUserPresets(presetsDir);
      if (userPresets.length > 0) {
        userPresetsHint = `Available user presets (${presetsDir}): ${userPresets.join(", ")}\n`;
      }
    }
    throw new Error(
      `Unknown preset: "${presetNameOrPath}"\n` +
        builtInHint +
        userPresetsHint +
        `Or provide a path to a custom preset file (e.g., ./my-preset.ts).`
    );
  }
  findBuiltInPath(presetName) {
    for (const ext of PRESET_EXTENSIONS) {
      const candidate = join(getBuiltInPresetsDir(), `${presetName}${ext}`);
      if (this.fileTool.exists(candidate)) {
        return candidate;
      }
    }
    return null;
  }
  findUserPresetPath(presetName, presetsDir) {
    for (const ext of PRESET_EXTENSIONS) {
      const candidate = join(presetsDir, `${presetName}${ext}`);
      if (this.fileTool.exists(candidate)) {
        return candidate;
      }
    }
    return null;
  }
  getUserPresets(presetsDir) {
    if (!this.dirTool.exists(presetsDir)) {
      return [];
    }
    const entries = this.dirTool.readDir(presetsDir) ?? [];
    return entries
      .map(name => this.stripPresetExtension(name))
      .filter(name => name !== null)
      .sort();
  }
  stripPresetExtension(filename) {
    for (const ext of PRESET_EXTENSIONS) {
      if (filename.endsWith(ext)) {
        return filename.slice(0, -ext.length);
      }
    }
    return null;
  }
}
export const PresetLoader = PresetLoaderAbstraction.createImplementation({
  implementation: PresetLoaderImpl,
  dependencies: [Logger, DirectoryTool, FileTool, MigrationConfig]
});
//# sourceMappingURL=PresetLoader.js.map
