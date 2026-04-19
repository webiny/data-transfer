import { createFeature } from "~/base/index.ts";
import { PutOsDynamoDbRecordExecutor } from "./PutOsDynamoDbRecordExecutor.ts";

export const PutOsDynamoDbRecordExecutorFeature = createFeature({
    name: "Core/PutOsDynamoDbRecordExecutorFeature",
    register(container) {
        container.register(PutOsDynamoDbRecordExecutor).inSingletonScope();
    }
});
