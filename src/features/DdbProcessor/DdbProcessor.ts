import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface DdbProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
}

class DdbProcessorImpl implements Processor.Interface<
    BaseTransformContext.Interface<unknown>,
    DdbProcessorSlice
> {
    public constructor(
        private readonly executor: DdbExecutor.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): DdbProcessorSlice {
        if (this.config.storage !== "ddb") {
            throw new Error("DdbProcessor can only be used in ddb mode");
        }
        const targetTable = this.config.target.dynamodb.tableName;
        return {
            putRecord(record: Record<string, unknown>) {
                base.addCommand(PutRecord.create({ table: targetTable, record }));
            }
        };
    }

    public onEnd(ctx: BaseTransformContext.Interface<unknown> & DdbProcessorSlice): void {
        ctx.putRecord(ctx.record as Record<string, unknown>);
    }

    public async execute(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        await this.executor.execute(puts);
    }

    public getShardState(): unknown {
        return {};
    }
}

export const DdbProcessor = Processor.createImplementation({
    implementation: DdbProcessorImpl,
    dependencies: [DdbExecutor, MigrationConfig]
});
