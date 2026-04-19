import { createFeature } from "~/base/index.ts";
import { PutDynamoDbRecordExecutor } from "./PutDynamoDbRecordExecutor.ts";

export const PutDynamoDbRecordExecutorFeature = createFeature({
    name: "Core/PutDynamoDbRecordExecutorFeature",
    register(container) {
        container.register(PutDynamoDbRecordExecutor).inSingletonScope();
    }
});
