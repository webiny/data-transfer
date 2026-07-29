import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
export async function discoverConfig(projectDir) {
  const configPath = resolve(join(projectDir, "config.ts"));
  try {
    await access(configPath);
    return configPath;
  } catch {
    return null;
  }
}
//# sourceMappingURL=configDiscovery.js.map
