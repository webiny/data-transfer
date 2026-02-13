import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { MigrationConfiguration } from "./types.ts";

// ============================================================================
// Config Loader
// ============================================================================

/**
 * Load and validate a migration configuration file.
 * Supports TypeScript files via dynamic import.
 */
export async function loadConfig(configPath: string): Promise<MigrationConfiguration> {
  // Resolve to absolute path
  const absolutePath = resolve(process.cwd(), configPath);

  // Convert to file URL for dynamic import
  const fileUrl = pathToFileURL(absolutePath).href;

  try {
    // Dynamic import the config file
    const module = await import(fileUrl);

    // Get default export
    const config = module.default;

    if (!config) {
      throw new Error(`Config file ${configPath} must have a default export`);
    }

    // Validate config structure
    validateConfig(config);

    return config as MigrationConfiguration;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validate that the config has all required fields
 */
function validateConfig(config: any): void {
  const errors: string[] = [];

  // Validate source
  if (!config.source) {
    errors.push("Missing required field: source");
  } else {
    if (!config.source.region) errors.push("Missing required field: source.region");
    if (!config.source.dynamodb?.tableName)
      errors.push("Missing required field: source.dynamodb.tableName");
    if (!config.source.s3?.bucket) errors.push("Missing required field: source.s3.bucket");
  }

  // Validate target
  if (!config.target) {
    errors.push("Missing required field: target");
  } else {
    if (!config.target.region) errors.push("Missing required field: target.region");
    if (!config.target.dynamodb?.tableName)
      errors.push("Missing required field: target.dynamodb.tableName");
    if (!config.target.s3?.bucket) errors.push("Missing required field: target.s3.bucket");
  }

  // Validate migration
  if (!config.migration) {
    errors.push("Missing required field: migration");
  } else {
    if (!config.migration.preset) errors.push("Missing required field: migration.preset");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n  ${errors.join("\n  ")}`);
  }
}
