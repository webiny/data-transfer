import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readdirSync } from "node:fs";

const BUILTIN_PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../presets");

const PRESET_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".js"]);

export interface PresetEntry {
    name: string;
    description: string;
}

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

function resolvePresetPath(name: string, presetsDir?: string): string | null {
    for (const ext of PRESET_EXTENSIONS) {
        const builtIn = join(BUILTIN_PRESETS_DIR, `${name}${ext}`);
        if (existsSync(builtIn)) {
            return builtIn;
        }
    }
    if (presetsDir) {
        for (const ext of PRESET_EXTENSIONS) {
            const user = join(presetsDir, `${name}${ext}`);
            if (existsSync(user)) {
                return user;
            }
        }
    }
    return null;
}

async function loadDescription(name: string, presetsDir?: string): Promise<string> {
    const filePath = resolvePresetPath(name, presetsDir);
    if (!filePath) {
        return "";
    }
    try {
        const mod = await import(pathToFileURL(filePath).href);
        const preset = mod.default ?? mod.preset;
        return typeof preset?.description === "string" ? preset.description : "";
    } catch {
        return "";
    }
}

export function listAvailablePresets(presetsDir?: string): string[] {
    const builtIns = scanDir(BUILTIN_PRESETS_DIR);
    const userPresets = presetsDir ? scanDir(presetsDir) : [];
    const all = new Set([...builtIns, ...userPresets]);
    return [...all].sort();
}

export async function listAvailablePresetsWithDescriptions(
    presetsDir?: string
): Promise<PresetEntry[]> {
    const names = listAvailablePresets(presetsDir);
    return Promise.all(
        names.map(async name => ({
            name,
            description: await loadDescription(name, presetsDir)
        }))
    );
}
