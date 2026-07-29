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
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FileTool } from "../tools/FileTool/abstractions/FileTool.js";
const SETUP_FILENAME = "setup.ts";
/**
 * Look for a sibling `setup.ts` next to the user's config file and, if
 * present, dynamic-import it and await its default-exported function with
 * `{ container }`. This runs BEFORE `preset.configure(runner)` so the user
 * can register custom processors / abstractions ahead of preset wiring.
 *
 * The file is entirely optional — pure-config / pure-preset users skip it.
 * Only `.ts` is supported; all user code in this project is typed.
 */
export async function loadUserSetup(configPath, container, logger) {
  const absoluteConfigPath = isAbsolute(configPath) ? configPath : resolve(configPath);
  const configDir = dirname(absoluteConfigPath);
  const setupPath = join(configDir, SETUP_FILENAME);
  const fileTool = container.resolve(FileTool);
  if (!fileTool.exists(setupPath)) {
    return;
  }
  logger.info(`Loading setup from ${setupPath}`);
  const mod = await import(__rewriteRelativeImportExtension(pathToFileURL(setupPath).href));
  const setupFn = mod.default;
  if (typeof setupFn !== "function") {
    throw new Error(
      `setup.ts at ${setupPath} must export a function as default. ` +
        `Use the initDataTransfer() helper to type it.`
    );
  }
  await setupFn({ container });
}
//# sourceMappingURL=loadUserSetup.js.map
