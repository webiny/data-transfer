import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { migrationConfigSchema } from "./validation.ts";
import { MigrationConfig } from "./abstractions/MigrationConfig.ts";

/**
 * Load and validate a migration configuration file.
 * Returns the validated config to be registered as an instance.
 */
export async function loadConfig(configPath: string): Promise<MigrationConfig.Interface> {
  const absolutePath = resolve(process.cwd(), configPath);
  const fileUrl = pathToFileURL(absolutePath).href;

  try {
    const module = await import(fileUrl);
    const config = module.default;

    if (!config) {
      throw new Error(`Config file ${configPath} must have a default export`);
    }

    return migrationConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
    }
    throw error;
  }
}
