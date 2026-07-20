import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export function discoverPresets(projectsDir: string): string[] {
    if (!existsSync(projectsDir)) {
        return [];
    }

    return readdirSync(projectsDir)
        .filter(name => {
            const full = join(projectsDir, name);
            return statSync(full).isDirectory() && existsSync(join(full, "config.ts"));
        })
        .sort();
}
