import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
export function discoverPresets(projectsDir) {
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
//# sourceMappingURL=discoverPresets.js.map
