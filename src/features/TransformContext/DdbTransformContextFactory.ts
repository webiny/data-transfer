import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { BaseTransformContextFactory } from "./abstractions/BaseTransformContext.ts";
import {
    DdbTransformContext as DdbTransformContextAbstraction,
    DdbTransformContextFactory as DdbTransformContextFactoryAbstraction
} from "./abstractions/DdbTransformContext.ts";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { SourceS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { Cache } from "~/tools/Cache/abstractions/Cache.ts";

class DdbTransformContextFactoryImpl implements DdbTransformContextFactoryAbstraction.Interface {
    public constructor(
        private readonly sourceDb: SourceDynamoDbClient.Interface,
        private readonly sourceS3: SourceS3Client.Interface,
        private readonly modelProvider: ModelProvider.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly cache: Cache.Interface
    ) {}

    public create<T extends BaseRecord>(
        params: BaseTransformContextFactory.CreateParams<T>
    ): DdbTransformContextAbstraction.Interface<T> {
        if (this.config.storage !== "ddb") {
            throw new Error("DdbTransformContextFactory can only be used in ddb mode");
        }

        const commands = new Commands();
        const sourcePrimaryTable = this.config.source.dynamodb.tableName;
        const targetPrimaryTable = this.config.target.dynamodb.tableName;
        const sourceFmBucket = this.config.source.s3.bucket;
        const targetFmBucket = this.config.target.s3.bucket;
        const factory = this;

        const ctx: DdbTransformContextAbstraction.Interface<any> = {
            record: structuredClone(params.record),
            original: Object.freeze(structuredClone(params.record)),
            commands,
            modelProvider: this.modelProvider,
            cache: this.cache,

            replace(newRecord) {
                ctx.record = newRecord;
            },

            putRecord: (record: Record<string, unknown>) => {
                commands.add(PutRecord.create({ table: targetPrimaryTable, record }));
            },

            queryRecord: async (pk: string, sk?: string) => {
                const results = await factory.sourceDb.query(sourcePrimaryTable, pk, sk);
                return results.length > 0 ? (results[0] as Record<string, unknown>) : null;
            },

            copyFile: (sourceKey: string, targetKey: string) => {
                commands.add(
                    S3Copy.create({
                        sourceBucket: sourceFmBucket,
                        sourceKey,
                        targetBucket: targetFmBucket,
                        targetKey
                    })
                );
            },

            getFile: async (key: string) => {
                return factory.sourceS3.getObject(sourceFmBucket, key);
            }
        };

        return ctx;
    }
}

export const DdbTransformContextFactory =
    DdbTransformContextFactoryAbstraction.createImplementation({
        implementation: DdbTransformContextFactoryImpl,
        dependencies: [SourceDynamoDbClient, SourceS3Client, ModelProvider, MigrationConfig, Cache]
    });
