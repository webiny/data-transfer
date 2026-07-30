import { createFeature } from "~/base/index.js";
import { Logger } from "~/tools/Logger/abstractions/Logger.js";
import { DynamoDbClientImpl } from "./DynamoDbClient.ts";
import { SourceDynamoDbClient, TargetDynamoDbClient } from "./abstractions/DynamoDbClient.ts";
import { DynamoDbClientConfig } from "./abstractions/DynamoDbClientConfig.ts";

export const DynamoDbClientFeature = createFeature({
    name: "Core/DynamoDbClientFeature",
    register(container) {
        const config = container.resolve(DynamoDbClientConfig);
        const logger = container.resolve(Logger);

        const sourceClient = new DynamoDbClientImpl(config.source, logger, config.tuning);
        container.registerInstance(SourceDynamoDbClient, sourceClient);

        const targetClient = new DynamoDbClientImpl(config.target, logger, config.tuning);
        container.registerInstance(TargetDynamoDbClient, targetClient);
    }
});
