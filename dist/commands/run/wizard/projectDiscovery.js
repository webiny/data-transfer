import { readdir } from "node:fs/promises";
import { join } from "node:path";
export async function discoverProjects(cwd) {
  let entries;
  try {
    entries = await readdir(join(cwd, "projects"), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}
//# sourceMappingURL=projectDiscovery.js.map
