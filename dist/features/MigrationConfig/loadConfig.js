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
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { migrationConfigSchema } from "./validation.js";
export async function loadConfig(configPath) {
  const absolutePath = resolve(process.cwd(), configPath);
  const fileUrl = pathToFileURL(absolutePath).href;
  const module = await import(__rewriteRelativeImportExtension(fileUrl)).catch(err => {
    throw new Error(
      `Failed to load config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  });
  const raw = module.default;
  if (!raw) {
    throw new Error(
      `Config file ${configPath} must have a default export. Use createConfig() to create your config.`
    );
  }
  const parsed = migrationConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid config in ${configPath}:\n${parsed.error.message}`);
  }
  const config = parsed.data;
  const configDir = dirname(absolutePath);
  const pipeline = config.pipeline ?? {};
  return {
    ...config,
    pipeline: {
      ...pipeline,
      ...(pipeline.modelsDir ? { modelsDir: resolve(configDir, pipeline.modelsDir) } : {}),
      ...(pipeline.presetsDir ? { presetsDir: resolve(configDir, pipeline.presetsDir) } : {})
    }
  };
}
//# sourceMappingURL=loadConfig.js.map
