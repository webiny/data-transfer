var __rewriteRelativeImportExtension =
  (this && this.__rewriteRelativeImportExtension) ||
  function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
      return path.replace(
        /\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i,
        function (m, tsx, d, ext, cm) {
          return tsx
            ? preserveJsx
              ? ".jsx"
              : ".js"
            : d && (!ext || !cm)
              ? m
              : d + ext + "." + cm.toLowerCase() + "js";
        }
      );
    }
    return path;
  };
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { findPackageRoot } from "../../../utils/findPackageRoot.js";
// Presets are compiled/copied alongside everything else, so they land at
// "<packageRoot>/presets" in the compiled (dist/) and published (npm)
// contexts, but stay nested under "src/" while running from source (tsx).
// Resolved lazily (not at module load) so importing this module doesn't
// require a real filesystem — tests that auto-mock "node:fs" still work.
let cachedBuiltInPresetsDir = null;
function getBuiltInPresetsDir() {
  if (cachedBuiltInPresetsDir) {
    return cachedBuiltInPresetsDir;
  }
  const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  cachedBuiltInPresetsDir = existsSync(join(packageRoot, "presets"))
    ? join(packageRoot, "presets")
    : join(packageRoot, "src", "presets");
  return cachedBuiltInPresetsDir;
}
const PRESET_EXTENSIONS = new Set([".ts", ".js"]);
function stripExtension(filename) {
  for (const ext of PRESET_EXTENSIONS) {
    if (filename.endsWith(ext)) {
      return filename.slice(0, -ext.length);
    }
  }
  return null;
}
function scanDir(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  try {
    return readdirSync(dir)
      .map(stripExtension)
      .filter(name => name !== null);
  } catch {
    return [];
  }
}
function resolvePresetPath(name, presetsDir) {
  for (const ext of PRESET_EXTENSIONS) {
    const builtIn = join(getBuiltInPresetsDir(), `${name}${ext}`);
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
async function loadDescription(name, presetsDir) {
  const filePath = resolvePresetPath(name, presetsDir);
  if (!filePath) {
    return "";
  }
  try {
    const mod = await import(__rewriteRelativeImportExtension(pathToFileURL(filePath).href));
    const preset = mod.default ?? mod.preset;
    return typeof preset?.description === "string" ? preset.description : "";
  } catch {
    return "";
  }
}
export function listAvailablePresets(presetsDir) {
  const builtIns = scanDir(getBuiltInPresetsDir());
  const userPresets = presetsDir ? scanDir(presetsDir) : [];
  const all = new Set([...builtIns, ...userPresets]);
  return [...all].sort();
}
export async function listAvailablePresetsWithDescriptions(presetsDir) {
  const names = listAvailablePresets(presetsDir);
  return Promise.all(
    names.map(async name => ({
      name,
      description: await loadDescription(name, presetsDir)
    }))
  );
}
//# sourceMappingURL=presetDiscovery.js.map
