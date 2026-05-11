import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface DdbProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
    querySourceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
        pk: string,
        sk?: string
    ): Promise<T | null>;
    queryTargetRecord<T extends Record<string, unknown> = Record<string, unknown>>(
        pk: string,
        sk?: string
    ): Promise<T | null>;
}

class DdbProcessorImpl implements Processor.Interface<
    BaseTransformContext.Interface<unknown>,
    DdbProcessorSlice
> {
    public constructor(
        private readonly executor: DdbExecutor.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly sourceDb: SourceDynamoDbClient.Interface,
        private readonly targetDb: TargetDynamoDbClient.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): DdbProcessorSlice {
        const sourceTable = this.config.source.dynamodb.tableName;
        const targetTable = this.config.target.dynamodb.tableName;
        const sourceDb = this.sourceDb;
        const targetDb = this.targetDb;
        return {
            putRecord(record: Record<string, unknown>) {
                base.addCommand(PutRecord.create({ table: targetTable, record }));
            },
            async querySourceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
                pk: string,
                sk?: string
            ): Promise<T | null> {
                const results = await sourceDb.query(sourceTable, pk, sk);
                return results.length > 0 ? (results[0] as unknown as T) : null;
            },
            async queryTargetRecord<T extends Record<string, unknown> = Record<string, unknown>>(
                pk: string,
                sk?: string
            ): Promise<T | null> {
                const results = await targetDb.query(targetTable, pk, sk);
                return results.length > 0 ? (results[0] as unknown as T) : null;
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
}

export const DdbProcessor = Processor.createImplementation({
    implementation: DdbProcessorImpl,
    dependencies: [DdbExecutor, MigrationConfig, SourceDynamoDbClient, TargetDynamoDbClient]
});
