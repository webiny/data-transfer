import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";

const BUILTIN_PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../presets");

const PRESET_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".js"]);

function stripExtension(filename: string): string | null {
    for (const ext of PRESET_EXTENSIONS) {
        if (filename.endsWith(ext)) {
            return filename.slice(0, -ext.length);
        }
    }
    return null;
}

function scanDir(dir: string): string[] {
    if (!existsSync(dir)) {
        return [];
    }
    try {
        return readdirSync(dir)
            .map(stripExtension)
            .filter((name): name is string => name !== null);
    } catch {
        return [];
    }
}

export function listAvailablePresets(presetsDir?: string): string[] {
    const builtIns = scanDir(BUILTIN_PRESETS_DIR);
    const userPresets = presetsDir ? scanDir(presetsDir) : [];
    const all = new Set([...builtIns, ...userPresets]);
    return [...all].sort();
}
