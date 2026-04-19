import { createAbstraction } from "~/base/index.ts";
import type { PutRecord } from "~/domain/transform/commands/PutRecord.ts";

interface IPutDynamoDbRecordExecutor {
    /** Write PutRecord commands to the target DDB table. Groups by table; no-op on empty input. */
    execute(puts: PutRecord[]): Promise<void>;
}

export const PutDynamoDbRecordExecutor = createAbstraction<IPutDynamoDbRecordExecutor>(
    "Core/PutDynamoDbRecordExecutor"
);

export namespace PutDynamoDbRecordExecutor {
    export type Interface = IPutDynamoDbRecordExecutor;
}
