import { TargetDynamoDbClient } from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { DdbExecutor as DdbExecutorAbstraction } from "./abstractions/DdbExecutor.js";
class DdbExecutorImpl {
  targetDb;
  constructor(targetDb) {
    this.targetDb = targetDb;
  }
  async execute(puts) {
    if (puts.length === 0) {
      return;
    }
    const byTable = new Map();
    for (const put of puts) {
      let bucket = byTable.get(put.table);
      if (!bucket) {
        bucket = [];
        byTable.set(put.table, bucket);
      }
      bucket.push(put.record);
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
//# sourceMappingURL=DdbExecutor.js.map
