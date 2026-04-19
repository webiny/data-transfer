import { createAbstraction } from "~/base/index.ts";
import type { PutRecord } from "~/domain/transform/commands/PutRecord.ts";

interface IPutOsDynamoDbRecordExecutor {
    /**
     * Gzip each put's `record.data`, ensure the target OS index exists for
     * every distinct `record.index` (creating missing ones with refresh
     * disabled), record the original `refresh_interval` of every touched
     * index into the `TouchedIndexes` singleton so the after-transfer hook
     * can restore them, and delegate the DDB batch write to
     * `PutDynamoDbRecordExecutor`.
     */
    execute(puts: PutRecord[]): Promise<void>;
}

export const PutOsDynamoDbRecordExecutor = createAbstraction<IPutOsDynamoDbRecordExecutor>(
    "Core/PutOsDynamoDbRecordExecutor"
);

export namespace PutOsDynamoDbRecordExecutor {
    export type Interface = IPutOsDynamoDbRecordExecutor;
}
