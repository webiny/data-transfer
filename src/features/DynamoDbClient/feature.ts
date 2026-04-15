import { createFeature } from "@/src/base/index.ts";
import { DynamoDbClientImpl } from "./DynamoDbClient.ts";
import { SourceDynamoDbClient, TargetDynamoDbClient } from "./abstractions/DynamoDbClient.ts";
import { DynamoDbClientConfig } from "./abstractions/DynamoDbClientConfig.ts";

export const DynamoDbClientFeature = createFeature({
  name: "Core/DynamoDbClientFeature",
  register(container) {
    const config = container.resolve(DynamoDbClientConfig);

    const sourceClient = new DynamoDbClientImpl(config.source);
    container.registerInstance(SourceDynamoDbClient, sourceClient);

    const targetClient = new DynamoDbClientImpl(config.target);
    container.registerInstance(TargetDynamoDbClient, targetClient);
  }
});
