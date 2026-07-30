import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.js";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.js";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.js";
import { AuditLogPutRecord } from "~/domain/transform/commands/AuditLogPutRecord.js";
import { PutRecord } from "~/domain/transform/commands/PutRecord.js";
import type { Commands } from "~/domain/transform/commands/Commands.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { isAccessDeniedError, type AwsErrorLike } from "~/base/index.js";

export type { IProcessor } from "~/domain/pipeline/abstractions/Processor.js";

interface AuditLogProcessorSlice {
    putAuditLog(record: Record<string, unknown>): void;
}

class AuditLogProcessorImpl implements Processor.Interface<
    BaseTransformContext.Interface<unknown>,
    AuditLogProcessorSlice
> {
    public constructor(
        private readonly executor: DdbExecutor.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): AuditLogProcessorSlice {
        const tableName = this.config.target.auditLog?.dynamodb?.tableName ?? null;
        return {
            putAuditLog(record: Record<string, unknown>): void {
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

    public onEnd(ctx: BaseTransformContext.Interface<unknown> & AuditLogProcessorSlice): void {
        ctx.putAuditLog(ctx.record as Record<string, unknown>);
    }

    public async checkAccess(): Promise<AccessCheck.Entry[]> {
        const tableName = this.config.target.auditLog?.dynamodb?.tableName ?? null;
        if (!tableName) {
            return [];
        }
        const label = `DynamoDB audit log table: ${tableName}`;
        const client = new DynamoDB({
            region: this.config.target.region,
            credentials: this.config.target.credentials as never
        });
        try {
            await client.describeTable({ TableName: tableName });
            return [{ label, status: "ok" }];
        } catch (error) {
            if (isAccessDeniedError(error)) {
                return [{ label, status: "denied" }];
            }
            const errName = (error as AwsErrorLike).name ?? (error as AwsErrorLike).code;
            if (errName === "ResourceNotFoundException") {
                return [{ label, status: "missing" }];
            }
            return [{ label, status: "unknown" }];
        } finally {
            client.destroy();
        }
    }

    public async execute(commands: Commands): Promise<void> {
        const tableName = this.config.target.auditLog?.dynamodb?.tableName ?? null;
        if (!tableName) {
            return;
        }
        const auditPuts = commands.get<AuditLogPutRecord>(AuditLogPutRecord.key);
        const puts = auditPuts.map(cmd =>
            PutRecord.create({ table: cmd.table, record: cmd.record })
        );
        await this.executor.execute(puts);
    }
}

export const AuditLogProcessor = Processor.createImplementation({
    implementation: AuditLogProcessorImpl,
    dependencies: [DdbExecutor, MigrationConfig]
});
