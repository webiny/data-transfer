import { Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { DdbExecutor } from "../../features/DdbExecutor/abstractions/DdbExecutor.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { AuditLogPutRecord } from "../../domain/transform/commands/AuditLogPutRecord.js";
import { PutRecord } from "../../domain/transform/commands/PutRecord.js";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { isAccessDeniedError } from "../../base/index.js";
class AuditLogProcessorImpl {
  executor;
  config;
  constructor(executor, config) {
    this.executor = executor;
    this.config = config;
  }
  extendContext(base) {
    const tableName = this.config.target.auditLog?.dynamodb?.tableName ?? null;
    return {
      putAuditLog(record) {
        if (!tableName) {
          return;
        }
        if (record.TYPE !== "auditLog.log") {
          return;
        }
        base.addCommand(AuditLogPutRecord.create({ table: tableName, record }));
      }
    };
  }
  onEnd(ctx) {
    ctx.putAuditLog(ctx.record);
  }
  async checkAccess() {
    const tableName = this.config.target.auditLog?.dynamodb?.tableName ?? null;
    if (!tableName) {
      return [];
    }
    const label = `DynamoDB audit log table: ${tableName}`;
    const client = new DynamoDB({
      region: this.config.target.region,
      credentials: this.config.target.credentials
    });
    try {
      await client.describeTable({ TableName: tableName });
      return [{ label, status: "ok" }];
    } catch (error) {
      if (isAccessDeniedError(error)) {
        return [{ label, status: "denied" }];
      }
      const errName = error.name ?? error.code;
      if (errName === "ResourceNotFoundException") {
        return [{ label, status: "missing" }];
      }
      return [{ label, status: "unknown" }];
    } finally {
      client.destroy();
    }
  }
  async execute(commands) {
    const tableName = this.config.target.auditLog?.dynamodb?.tableName ?? null;
    if (!tableName) {
      return;
    }
    const auditPuts = commands.get(AuditLogPutRecord.key);
    const puts = auditPuts.map(cmd => PutRecord.create({ table: cmd.table, record: cmd.record }));
    await this.executor.execute(puts);
  }
}
export const AuditLogProcessor = Processor.createImplementation({
  implementation: AuditLogProcessorImpl,
  dependencies: [DdbExecutor, MigrationConfig]
});
//# sourceMappingURL=AuditLogProcessor.js.map
