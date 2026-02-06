import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { DatabaseClient } from "../database/interface.ts";
import { Model } from "./types.ts";
import { createLogger, Logger } from "../utils/logger.ts";

// ============================================================================
// Model Provider
// ============================================================================

/**
 * Loads and caches CMS models from database and JSON files.
 * Models are preloaded once per segment for efficient access.
 */
export class ModelProvider {
  private models: Map<string, Model> = new Map();
  private logger: Logger;

  constructor(
    private database: DatabaseClient,
    private tableName: string,
    private modelsDir?: string
  ) {
    this.logger = createLogger();
  }

  /**
   * Preloads all models from database and JSON files
   */
  async preloadModels(tenantLocales: Map<string, string>): Promise<void> {
    let dbCount = 0;
    let jsonCount = 0;

    // Load models from database for each tenant
    for (const [tenantId, locale] of tenantLocales) {
      const pk = `T#${tenantId}#L#${locale}#CMS#CM`;

      try {
        const records = await this.database.query(this.tableName, pk);

        for (const record of records) {
          const modelId = record.modelId as string;
          if (modelId && !this.models.has(modelId)) {
            this.models.set(modelId, record as Model);
            dbCount++;
          }
        }
      } catch (error) {
        this.logger.warn({ error }, `Failed to load models for tenant ${tenantId}`);
      }
    }

    // Load models from JSON files (if directory provided)
    if (this.modelsDir) {
      try {
        const files = await readdir(this.modelsDir);
        const jsonFiles = files.filter(f => f.endsWith(".json"));

        for (const file of jsonFiles) {
          try {
            const path = join(this.modelsDir, file);
            const content = await readFile(path, "utf-8");
            const model = JSON.parse(content) as Model;

            // Use modelId from inside the file, not filename!
            if (model.modelId) {
              // JSON models override DB models (user-provided takes precedence)
              this.models.set(model.modelId, model);
              jsonCount++;
            } else {
              this.logger.warn(`Model file ${file} missing modelId property`);
            }
          } catch (error) {
            this.logger.warn({ error }, `Failed to load model from ${file}`);
          }
        }
      } catch (error) {
        this.logger.warn({ error }, `Failed to read models directory ${this.modelsDir}`);
      }
    }

    this.logger.info(
      `Preloaded ${this.models.size} models (${dbCount} from DB, ${jsonCount} from JSON)`
    );
  }

  /**
   * Gets a model by its modelId
   */
  getModel(modelId: string): Model | undefined {
    return this.models.get(modelId);
  }

  /**
   * Gets all loaded model IDs
   */
  getModelIds(): string[] {
    return Array.from(this.models.keys());
  }
}
