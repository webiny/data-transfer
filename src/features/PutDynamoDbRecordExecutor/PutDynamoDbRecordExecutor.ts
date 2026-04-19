import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { PutDynamoDbRecordExecutor as PutDynamoDbRecordExecutorAbstraction } from "./abstractions/PutDynamoDbRecordExecutor.ts";

class PutDynamoDbRecordExecutorImpl implements PutDynamoDbRecordExecutorAbstraction.Interface {
    public constructor(private readonly targetDb: TargetDynamoDbClient.Interface) {}

    public async execute(puts: PutRecord[]): Promise<void> {
        if (puts.length === 0) {
            return;
        }

        const byTable = new Map<string, Record<string, unknown>[]>();
        for (const put of puts) {
            let bucket = byTable.get(put.table);
            if (!bucket) {
                bucket = [];
                byTable.set(put.table, bucket);
            }
            bucket.push(put.record);
        }

        await Promise.all(
            Array.from(byTable.entries()).map(([table, records]) =>
                this.targetDb.batchPut(table, records as any)
            )
        );
    }
}

export const PutDynamoDbRecordExecutor = PutDynamoDbRecordExecutorAbstraction.createImplementation({
    implementation: PutDynamoDbRecordExecutorImpl,
    dependencies: [TargetDynamoDbClient]
});
