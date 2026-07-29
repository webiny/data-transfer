import { Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { DdbExecutor } from "../../features/DdbExecutor/abstractions/DdbExecutor.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import {
  SourceDynamoDbClient,
  TargetDynamoDbClient
} from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { PutRecord } from "../../domain/transform/commands/PutRecord.js";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { isAccessDeniedError } from "../../base/index.js";
class DdbProcessorImpl {
  executor;
  config;
  sourceDb;
  targetDb;
  transferContext;
  constructor(executor, config, sourceDb, targetDb, transferContext) {
    this.executor = executor;
    this.config = config;
    this.sourceDb = sourceDb;
    this.targetDb = targetDb;
    this.transferContext = transferContext;
  }
  extendContext(base) {
    const sourceTable = this.config.source.dynamodb.tableName;
    const targetTable = this.config.target.dynamodb.tableName;
    const sourceDb = this.sourceDb;
    const targetDb = this.targetDb;
    return {
      putRecord(record) {
        base.addCommand(PutRecord.create({ table: targetTable, record }));
      },
      async querySourceRecord(pk, sk) {
        const results = await sourceDb.query(sourceTable, pk, sk);
        return results.length > 0 ? results[0] : null;
      },
      async queryTargetRecord(pk, sk) {
        const results = await targetDb.query(targetTable, pk, sk);
        return results.length > 0 ? results[0] : null;
      }
    };
  }
  onEnd(ctx) {
    ctx.putRecord(ctx.record);
  }
  async checkAccess() {
    const [sourceEntry, targetEntry] = await Promise.all([
      this.describeTable(
        this.config.source.credentials,
        this.config.source.region,
        this.config.source.dynamodb.tableName,
        "source"
      ),
      this.describeTable(
        this.config.target.credentials,
        this.config.target.region,
        this.config.target.dynamodb.tableName,
        "target"
      )
    ]);
    return [sourceEntry, targetEntry];
  }
  async describeTable(credentials, region, tableName, side) {
    const label = `DynamoDB ${side} table: ${tableName}`;
    const client = new DynamoDB({ region, credentials: credentials });
    try {
      await client.describeTable({ TableName: tableName });
      return { label, status: "ok" };
    } catch (error) {
      if (isAccessDeniedError(error)) {
        return { label, status: "denied" };
      }
      const errName = error.name ?? error.code;
      if (errName === "ResourceNotFoundException") {
        return { label, status: "missing" };
      }
      return { label, status: "unknown" };
    } finally {
      client.destroy();
    }
  }
  async execute(commands) {
    if (this.transferContext.dryRun) {
      return;
    }
    const puts = commands.get(PutRecord.key);
    await this.executor.execute(puts);
  }
}
export const DdbProcessor = Processor.createImplementation({
  implementation: DdbProcessorImpl,
  dependencies: [
    DdbExecutor,
    MigrationConfig,
    SourceDynamoDbClient,
    TargetDynamoDbClient,
    TransferContext
  ]
});
//# sourceMappingURL=DdbProcessor.js.map
