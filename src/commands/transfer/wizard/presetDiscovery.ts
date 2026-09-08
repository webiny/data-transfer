import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { findPackageRoot } from "~/utils/findPackageRoot.js";

let cachedBuiltInPresetsDir: string | null = null;

function getBuiltInPresetsDir(): string {
    if (cachedBuiltInPresetsDir) {
        return cachedBuiltInPresetsDir;
    }
    const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
    cachedBuiltInPresetsDir = existsSync(join(packageRoot, "presets"))
        ? join(packageRoot, "presets")
        : join(packageRoot, "src", "presets");
    return cachedBuiltInPresetsDir;
}

const PRESET_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".js"]);

export interface PresetEntry {
    name: string;
    description: string;
}

function isPresetFile(filename: string): boolean {
    if (filename.endsWith(".d.ts")) {
        return false;
    }
    for (const ext of PRESET_EXTENSIONS) {
        if (filename.endsWith(ext)) {
            return true;
        }
    }
    return false;
}

function stripExtension(filename: string): string | null {
    if (filename.endsWith(".d.ts")) {
        return null;
    }
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

function scanDirPaths(dir: string): string[] {
    if (!existsSync(dir)) {
        return [];
    }
    try {
        return readdirSync(dir)
            .filter(isPresetFile)
            .map(filename => join(dir, filename));
    } catch {
        return [];
    }
}

async function loadPresetEntry(filePath: string): Promise<PresetEntry | null> {
    try {
        const mod = await import(pathToFileURL(filePath).href);
        const preset = mod.default ?? mod.preset;
        if (!preset || typeof preset.name !== "string") {
            return null;
        }
        return {
            name: preset.name,
            description: typeof preset.description === "string" ? preset.description : ""
        };
    } catch {
        return null;
    }
}

export function listAvailablePresets(presetsDir?: string): string[] {
    const builtIns = scanDir(getBuiltInPresetsDir());
    const userPresets = presetsDir ? scanDir(presetsDir) : [];
    const all = new Set([...builtIns, ...userPresets]);
    return [...all].sort();
}

export async function listAvailablePresetsWithDescriptions(
    presetsDir?: string
): Promise<PresetEntry[]> {
    const builtInPaths = scanDirPaths(getBuiltInPresetsDir());
    const userPaths = presetsDir ? scanDirPaths(presetsDir) : [];
    const allPaths = [...builtInPaths, ...userPaths];

    const results = await Promise.all(allPaths.map(loadPresetEntry));

    const seen = new Set<string>();
    const entries: PresetEntry[] = [];
    for (const entry of results) {
        if (entry && !seen.has(entry.name)) {
            seen.add(entry.name);
            entries.push(entry);
        }
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
}
