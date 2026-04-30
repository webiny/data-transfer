import {
    type DatabaseRecord,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { DdbExecutor as DdbExecutorAbstraction } from "./abstractions/DdbExecutor.ts";

class DdbExecutorImpl implements DdbExecutorAbstraction.Interface {
    public constructor(private readonly targetDb: TargetDynamoDbClient.Interface) {}

    public async execute(puts: PutRecord[]): Promise<void> {
        if (puts.length === 0) {
            return;
        }

        const byTable = new Map<string, DatabaseRecord[]>();
        for (const put of puts) {
            let bucket = byTable.get(put.table);
            if (!bucket) {
                bucket = [];
                byTable.set(put.table, bucket);
            }
            bucket.push(put.record as DatabaseRecord);
        }

        for (const [table, records] of byTable) {
            await this.targetDb.batchPut(table, records);
        }
    }
}

export const DdbExecutor = DdbExecutorAbstraction.createImplementation({
    implementation: DdbExecutorImpl,
    dependencies: [TargetDynamoDbClient]
});
