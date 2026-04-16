import { createFeature } from "@/src/base/index.ts";
import { ModelProviderImpl } from "./ModelProvider.ts";
import { ModelProvider } from "./abstractions/ModelProvider.ts";
import { SourceDynamoDbClient } from "../DynamoDbClient/abstractions/DynamoDbClient.ts";
import { Logger } from "../Logger/abstractions/Logger.ts";
import { MigrationConfig } from "../MigrationConfig/abstractions/MigrationConfig.ts";

export const ModelProviderFeature = createFeature({
    name: "Core/ModelProviderFeature",
    register(container) {
        const database = container.resolve(SourceDynamoDbClient);
        const logger = container.resolve(Logger);
        const config = container.resolve(MigrationConfig);

        const tableName = config.source.dynamodb.tableName;
        const modelsDir = config.pipeline.modelsDir;

        const provider = new ModelProviderImpl(database, logger, tableName, modelsDir);
        container.registerInstance(ModelProvider, provider);
    }
});
