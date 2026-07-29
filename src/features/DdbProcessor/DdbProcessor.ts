import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.js";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.js";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.js";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.js";
import { PutRecord } from "~/domain/transform/commands/PutRecord.js";
import type { Commands } from "~/domain/transform/commands/Commands.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { isAccessDeniedError, type AwsErrorLike } from "~/base/index.js";

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
        private readonly targetDb: TargetDynamoDbClient.Interface,
        private readonly transferContext: TransferContext.Interface
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

    public async checkAccess(): Promise<AccessCheck.Entry[]> {
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

    private async describeTable(
        credentials: MigrationConfig.Interface["source"]["credentials"],
        region: string,
        tableName: string,
        side: string
    ): Promise<AccessCheck.Entry> {
        const label = `DynamoDB ${side} table: ${tableName}`;
        const client = new DynamoDB({ region, credentials: credentials as never });
        try {
            await client.describeTable({ TableName: tableName });
            return { label, status: "ok" };
        } catch (error) {
            if (isAccessDeniedError(error)) {
                return { label, status: "denied" };
            }
            const errName = (error as AwsErrorLike).name ?? (error as AwsErrorLike).code;
            if (errName === "ResourceNotFoundException") {
                return { label, status: "missing" };
            }
            return { label, status: "unknown" };
        } finally {
            client.destroy();
        }
    }

    public async execute(commands: Commands): Promise<void> {
        if (this.transferContext.dryRun) {
            return;
        }
        const puts = commands.get<PutRecord>(PutRecord.key);
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
