import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface ConfigEntry {
    path: string;
    label: string;
}

const STORAGE_LABELS: Record<string, string> = {
    ddb: "DynamoDB Transfer",
    os: "OpenSearch Transfer"
};

interface ConfigModule {
    storage?: string;
}

export async function discoverConfigs(projectDir: string): Promise<ConfigEntry[]> {
    let entries;
    try {
        entries = await readdir(projectDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const configFiles = entries
        .filter(e => e.isFile() && e.name.endsWith(".config.ts"))
        .map(e => resolve(join(projectDir, e.name)));

    const results: ConfigEntry[] = [];
    for (const filePath of configFiles) {
        try {
            const mod = await import(filePath);
            const config = mod.default as ConfigModule | undefined;
            const storage = config?.storage ?? "";
            const label = STORAGE_LABELS[storage] ?? filePath.split("/").pop() ?? filePath;
            results.push({ path: filePath, label });
        } catch (err) {
            console.warn(
                `Warning: could not import config ${filePath} — ${err instanceof Error ? err.message : String(err)} — skipping.`
            );
        }
    }
    return results;
}
