import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import { PresetLoader as PresetLoaderAbstraction } from "./abstractions/PresetLoader.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";

// Built-in presets are auto-discovered from the sibling `src/presets/` directory
// at runtime. PresetLoader resolves its own location via import.meta.url, so
// this works whether the package is running from source in-repo or installed
// as `node_modules/@webiny/data-transfer/...`. Convention: the filename
// (without extension) IS the preset name. Drop a `.ts` file in `src/presets/`
// and it ships — no other code change.
const BUILTIN_PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../presets");

const PRESET_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".js"]);

class PresetLoaderImpl implements PresetLoaderAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface
    ) {}

    public async load(presetNameOrPath: string): Promise<MigrationPreset> {
        const presetPath = this.resolvePresetPath(presetNameOrPath);

        this.logger.info(`Loading preset from: ${presetPath}`);

        try {
            const presetModule = await import(pathToFileURL(presetPath).href);
            const preset: MigrationPreset = presetModule.default || presetModule.preset;

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

    public getBuiltInPresets(): string[] {
        if (!this.dirTool.exists(BUILTIN_PRESETS_DIR)) {
            return [];
        }
        const entries = this.dirTool.readDir(BUILTIN_PRESETS_DIR) ?? [];
        return entries
            .map(name => this.stripPresetExtension(name))
            .filter((name): name is string => name !== null)
            .sort();
    }

    private stripPresetExtension(filename: string): string | null {
        for (const ext of PRESET_EXTENSIONS) {
            if (filename.endsWith(ext)) {
                return filename.slice(0, -ext.length);
            }
        }
        return null;
    }

    private resolvePresetPath(presetNameOrPath: string): string {
        const builtInPath = this.findBuiltInPath(presetNameOrPath);
        if (builtInPath) {
            return builtInPath;
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

        const available = this.getBuiltInPresets().join(", ");
        const availableHint =
            available.length > 0 ? `Available built-in presets: ${available}\n` : "";
        throw new Error(
            `Unknown preset: "${presetNameOrPath}"\n` +
                availableHint +
                `Or provide a path to a custom preset file (e.g., ./my-preset.ts).`
        );
    }

    private findBuiltInPath(presetName: string): string | null {
        for (const ext of PRESET_EXTENSIONS) {
            const candidate = join(BUILTIN_PRESETS_DIR, `${presetName}${ext}`);
            if (this.fileTool.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }
}

export const PresetLoader = PresetLoaderAbstraction.createImplementation({
    implementation: PresetLoaderImpl,
    dependencies: [Logger, DirectoryTool, FileTool]
});
