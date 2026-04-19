import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { MigrationConfig } from "./abstractions/MigrationConfig.ts";

/**
 * Load a transfer configuration file.
 *
 * The config file should use `createDdbTransfer` or `createOsTransfer`
 * to create and validate the config. The loader performs a lightweight
 * check — the builder functions handle full validation.
 */
export async function loadConfig(configPath: string): Promise<MigrationConfig.Interface> {
    const absolutePath = resolve(process.cwd(), configPath);
    const fileUrl = pathToFileURL(absolutePath).href;

    try {
        const module = await import(fileUrl);
        const config = module.default;

        if (!config) {
            throw new Error(
                `Config file ${configPath} must have a default export. ` +
                    `Use createDdbTransfer() or createOsTransfer() to create your config.`
            );
        }

        if (!config.storage || (config.storage !== "ddb" && config.storage !== "os")) {
            throw new Error(
                `Config file ${configPath} has invalid or missing "storage" field. ` +
                    `Use createDdbTransfer() or createOsTransfer() to create your config.`
            );
        }

        // Resolve path-shaped pipeline fields relative to the config file's
        // directory. Built-in preset NAMES (e.g. "v5-to-v6") are left alone.
        const configDir = dirname(absolutePath);
        if (config.pipeline?.modelsDir) {
            config.pipeline.modelsDir = resolve(configDir, config.pipeline.modelsDir);
        }
        if (
            typeof config.pipeline?.preset === "string" &&
            (config.pipeline.preset.endsWith(".ts") || config.pipeline.preset.endsWith(".js"))
        ) {
            config.pipeline.preset = resolve(configDir, config.pipeline.preset);
        }

        return config as MigrationConfig.Interface;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
        }
        throw error;
    }
}
