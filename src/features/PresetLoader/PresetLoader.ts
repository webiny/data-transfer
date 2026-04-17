import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import { PresetLoader as PresetLoaderAbstraction } from "./abstractions/PresetLoader.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";

const BUILT_IN_PRESETS = new Map<string, string>([
    ["v5-to-v6", fileURLToPath(new URL("../../presets/v5-to-v6-ddb.ts", import.meta.url))],
    ["v5-to-v6-os", fileURLToPath(new URL("../../presets/v5-to-v6-os.ts", import.meta.url))]
]);

class PresetLoaderImpl implements PresetLoaderAbstraction.Interface {
    public constructor(private readonly logger: Logger.Interface) {}

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
        return Array.from(BUILT_IN_PRESETS.keys());
    }

    private resolvePresetPath(presetNameOrPath: string): string {
        if (BUILT_IN_PRESETS.has(presetNameOrPath)) {
            return BUILT_IN_PRESETS.get(presetNameOrPath)!;
        }

        if (presetNameOrPath.endsWith(".ts") || presetNameOrPath.endsWith(".js")) {
            const presetPath = isAbsolute(presetNameOrPath)
                ? presetNameOrPath
                : resolve(process.cwd(), presetNameOrPath);

            if (!existsSync(presetPath)) {
                throw new Error(
                    `Preset file not found: ${presetPath}\n` +
                        `Make sure the file exists and the path is correct.`
                );
            }

            return presetPath;
        }

        const available = Array.from(BUILT_IN_PRESETS.keys()).join(", ");
        throw new Error(
            `Unknown preset: "${presetNameOrPath}"\n` +
                `Available built-in presets: ${available}\n` +
                `Or provide a path to a custom preset file (e.g., ./my-preset.ts)`
        );
    }
}

export const PresetLoader = PresetLoaderAbstraction.createImplementation({
    implementation: PresetLoaderImpl,
    dependencies: [Logger]
});
