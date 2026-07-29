import { join } from "path";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { Logger } from "~/tools/Logger/abstractions/Logger.js";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.js";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.js";
import { ModelProvider as ModelProviderAbstraction } from "./abstractions/ModelProvider.ts";

function isModel(value: unknown): value is ModelProviderAbstraction.ModelType {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as Record<string, unknown>).modelId === "string" &&
        Array.isArray((value as Record<string, unknown>).fields)
    );
}

class ModelProviderImpl implements ModelProviderAbstraction.Interface {
    private models: Map<string, ModelProviderAbstraction.ModelType> = new Map();
    private readonly tableName: string;
    private readonly modelsDir?: string;

    public constructor(
        private readonly database: SourceDynamoDbClient.Interface,
        private readonly logger: Logger.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface,
        config: MigrationConfig.Interface
    ) {
        this.tableName = config.source.dynamodb.tableName;
        this.modelsDir = config.pipeline?.modelsDir;
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
                        const parsed = JSON.parse(content) as unknown;
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

    private extractModels(parsed: unknown): ModelProviderAbstraction.ModelType[] {
        // Shape 1: array of models at root — [{modelId, ...}, ...]
        if (Array.isArray(parsed)) {
            return parsed.filter(isModel);
        }

        if (!parsed || typeof parsed !== "object") {
            return [];
        }

        const obj = parsed as Record<string, unknown>;

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

    public getModel(modelId: string): ModelProviderAbstraction.ModelType | undefined {
        return this.models.get(modelId);
    }

    public getModelIds(): string[] {
        return Array.from(this.models.keys());
    }
}

export const ModelProvider = ModelProviderAbstraction.createImplementation({
    implementation: ModelProviderImpl,
    dependencies: [SourceDynamoDbClient, Logger, DirectoryTool, FileTool, MigrationConfig]
});
