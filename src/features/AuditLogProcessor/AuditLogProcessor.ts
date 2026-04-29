import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { AuditLogPutRecord } from "~/domain/transform/commands/AuditLogPutRecord.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface AuditLogProcessorSlice {
    putAuditLog(record: Record<string, unknown>): void;
}

class AuditLogProcessorImpl
    implements Processor.Interface<BaseTransformContext.Interface<unknown>, AuditLogProcessorSlice>
{
    public constructor(
        private readonly executor: DdbExecutor.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): AuditLogProcessorSlice {
        const tableName =
            this.config.storage === "ddb"
                ? (this.config.target.auditLog?.dynamodb?.tableName ?? null)
                : null;
        return {
            putAuditLog(record: Record<string, unknown>): void {
                if (!tableName) {
                    return;
                }
                base.addCommand(AuditLogPutRecord.create({ table: tableName, record }));
            }
        };
    }

    public onEnd(ctx: BaseTransformContext.Interface<unknown> & AuditLogProcessorSlice): void {
        ctx.putAuditLog(ctx.record as Record<string, unknown>);
    }

    public async execute(commands: Commands): Promise<void> {
        const tableName =
            this.config.storage === "ddb"
                ? (this.config.target.auditLog?.dynamodb?.tableName ?? null)
                : null;
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
