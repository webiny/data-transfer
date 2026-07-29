import { join } from "path";
import { SourceDynamoDbClient } from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { ModelProvider as ModelProviderAbstraction } from "./abstractions/ModelProvider.js";
function isModel(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.modelId === "string" &&
    Array.isArray(value.fields)
  );
}
class ModelProviderImpl {
  database;
  logger;
  dirTool;
  fileTool;
  models = new Map();
  tableName;
  modelsDir;
  constructor(database, logger, dirTool, fileTool, config) {
    this.database = database;
    this.logger = logger;
    this.dirTool = dirTool;
    this.fileTool = fileTool;
    this.tableName = config.source.dynamodb.tableName;
    this.modelsDir = config.pipeline?.modelsDir;
  }
  async preloadModels(tenantLocales) {
    let dbCount = 0;
    let jsonCount = 0;
    // Load models from database for each tenant
    for (const [tenantId, locale] of tenantLocales) {
      const pk = `T#${tenantId}#L#${locale}#CMS#CM`;
      try {
        const records = await this.database.query(this.tableName, pk);
        for (const record of records) {
          const modelId = record.modelId;
          if (modelId && !this.models.has(modelId)) {
            this.models.set(modelId, record);
            dbCount++;
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to load models for tenant ${tenantId}: ${error}`);
      }
    }
    // Load models from JSON files (if directory provided)
    if (this.modelsDir) {
      const files = this.dirTool.readDir(this.modelsDir);
      if (files) {
        const jsonFiles = files.filter(f => f.endsWith(".json"));
        for (const file of jsonFiles) {
          try {
            const path = join(this.modelsDir, file);
            const content = this.fileTool.readFile(path);
            if (content === null) {
              this.logger.warn(`Failed to read model file ${file}`);
              continue;
            }
            const parsed = JSON.parse(content);
            const extracted = this.extractModels(parsed);
            if (extracted.length === 0) {
              this.logger.warn(`Model file ${file} contains no recognisable models`);
              continue;
            }
            for (const model of extracted) {
              // JSON models override DB models (user-provided takes precedence)
              this.models.set(model.modelId, model);
              jsonCount++;
            }
          } catch (error) {
            this.logger.warn(`Failed to load model from ${file}: ${error}`);
          }
        }
      }
    }
    this.logger.info(
      `Preloaded ${this.models.size} models (${dbCount} from DB, ${jsonCount} from JSON)`
    );
  }
  extractModels(parsed) {
    // Shape 1: array of models at root — [{modelId, ...}, ...]
    if (Array.isArray(parsed)) {
      return parsed.filter(isModel);
    }
    if (!parsed || typeof parsed !== "object") {
      return [];
    }
    const obj = parsed;
    // Shape 2: Webiny export — {groups: [...], models: [...]}
    if (Array.isArray(obj.models)) {
      return obj.models.filter(isModel);
    }
    // Shape 3: single model — {modelId, fields, ...}
    if (isModel(obj)) {
      return [obj];
    }
    return [];
  }
  getModel(modelId) {
    return this.models.get(modelId);
  }
  getModelIds() {
    return Array.from(this.models.keys());
  }
}
export const ModelProvider = ModelProviderAbstraction.createImplementation({
  implementation: ModelProviderImpl,
  dependencies: [SourceDynamoDbClient, Logger, DirectoryTool, FileTool, MigrationConfig]
});
//# sourceMappingURL=ModelProvider.js.map
