import { MigrationPreset } from "./types.ts";
import { pathToFileURL } from "node:url";
import { resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";

// ============================================================================
// Preset Loader
// ============================================================================

const BUILT_IN_PRESETS = new Map<string, string>([
    ["v5-to-v6", new URL("../presets/v5-to-v6-ddb.ts", import.meta.url).pathname],
    ["v5-to-v6-os", new URL("../presets/v5-to-v6-os.ts", import.meta.url).pathname]
]);

/**
 * Load a migration preset by name or file path.
 *
 * Supports:
 * - Built-in preset names: "v5-to-v6"
 * - Relative paths: "./my-preset.ts"
 * - Absolute paths: "/path/to/preset.ts"
 *
 * @param presetNameOrPath - Preset name or file path
 * @param cwd - Current working directory (for resolving relative paths)
 */
export async function loadPreset(
    presetNameOrPath: string,
    cwd: string = process.cwd()
): Promise<MigrationPreset> {
    let presetPath: string;

    // Check if it's a built-in preset name
    if (BUILT_IN_PRESETS.has(presetNameOrPath)) {
        presetPath = BUILT_IN_PRESETS.get(presetNameOrPath)!;
    }
    // Check if it's a file path
    else if (presetNameOrPath.endsWith(".ts") || presetNameOrPath.endsWith(".js")) {
        // Resolve relative paths against cwd
        presetPath = isAbsolute(presetNameOrPath)
            ? presetNameOrPath
            : resolve(cwd, "..", presetNameOrPath);

        // Verify the file exists
        if (!existsSync(presetPath)) {
            throw new Error(
                `Preset file not found: ${presetPath}\n` +
                    `Make sure the file exists and the path is correct.`
            );
        }
    }
    // Unknown preset
    else {
        const available = Array.from(BUILT_IN_PRESETS.keys()).join(", ");
        throw new Error(
            `Unknown preset: "${presetNameOrPath}"\n` +
                `Available built-in presets: ${available}\n` +
                `Or provide a path to a custom preset file (e.g., ./my-preset.ts)`
        );
    }

    // Load the preset module
    try {
        const presetModule = await import(pathToFileURL(presetPath).href);

        // Support both default and named exports
        const preset: MigrationPreset = presetModule.default || presetModule.preset;

        if (!preset) {
            throw new Error(
                `Preset file "${presetPath}" does not export a preset.\n` +
                    `Make sure to export a MigrationPreset object as the default export or named "preset" export.`
            );
        }

        // Validate preset structure
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

/**
 * Get a list of available built-in preset names.
 */
export function getBuiltInPresets(): string[] {
    return Array.from(BUILT_IN_PRESETS.keys());
}
