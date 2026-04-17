import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { ModelProvider as ModelProviderAbstraction } from "./abstractions/ModelProvider.ts";

class ModelProviderImpl implements ModelProviderAbstraction.Interface {
    private models: Map<string, ModelProviderAbstraction.ModelType> = new Map();
    private readonly tableName: string;
    private readonly modelsDir?: string;

    public constructor(
        private readonly database: SourceDynamoDbClient.Interface,
        private readonly logger: Logger.Interface,
        config: MigrationConfig.Interface
    ) {
        this.tableName = config.source.dynamodb.tableName;
        this.modelsDir = config.pipeline.modelsDir;
    }

    public async preloadModels(tenantLocales: Map<string, string>): Promise<void> {
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
                        this.models.set(modelId, record as ModelProviderAbstraction.ModelType);
                        dbCount++;
                    }
                }
            } catch (error) {
                this.logger.warn(`Failed to load models for tenant ${tenantId}: ${error}`);
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
                        const model = JSON.parse(content) as ModelProviderAbstraction.ModelType;

                        if (model.modelId) {
                            // JSON models override DB models (user-provided takes precedence)
                            this.models.set(model.modelId, model);
                            jsonCount++;
                        } else {
                            this.logger.warn(`Model file ${file} missing modelId property`);
                        }
                    } catch (error) {
                        this.logger.warn(`Failed to load model from ${file}: ${error}`);
                    }
                }
            } catch (error) {
                this.logger.warn(`Failed to read models directory ${this.modelsDir}: ${error}`);
            }
        }

        this.logger.info(
            `Preloaded ${this.models.size} models (${dbCount} from DB, ${jsonCount} from JSON)`
        );
    }

    public getModel(modelId: string): ModelProviderAbstraction.ModelType | undefined {
        return this.models.get(modelId);
    }

    public getModelIds(): string[] {
        return Array.from(this.models.keys());
    }
}

export const ModelProvider = ModelProviderAbstraction.createImplementation({
    implementation: ModelProviderImpl,
    dependencies: [SourceDynamoDbClient, Logger, MigrationConfig]
});
