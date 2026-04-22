import { Commands } from "~/domain/transform/commands/Commands.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { Cache } from "~/tools/Cache/abstractions/Cache.ts";
import {
    BaseTransformContext as BaseTransformContextAbstraction,
    BaseTransformContextFactory as BaseTransformContextFactoryAbstraction
} from "./abstractions/BaseTransformContext.ts";

class BaseTransformContextFactoryImpl implements BaseTransformContextFactoryAbstraction.Interface {
    public constructor(
        private readonly sourceDb: SourceDynamoDbClient.Interface,
        private readonly modelProvider: ModelProvider.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly cache: Cache.Interface
    ) {}

    public create<TRecord>(
        params: BaseTransformContextFactoryAbstraction.CreateParams<TRecord>
    ): BaseTransformContextFactoryAbstraction.CreateResult<TRecord> {
        const commands = new Commands();
        const sourcePrimaryTable = this.config.source.dynamodb.tableName;
        const sourceDb = this.sourceDb;
        const modelProvider = this.modelProvider;
        const cache = this.cache;

        const ctx: BaseTransformContextAbstraction.Interface<TRecord> = {
            record: structuredClone(params.record),
            original: Object.freeze(structuredClone(params.record)) as Readonly<TRecord>,
            modelProvider,
            cache,
            replace(newRecord: TRecord): void {
                ctx.record = newRecord;
            },
            addCommand(cmd): void {
                commands.add(cmd);
            },
            async querySourceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
                pk: string,
                sk?: string
            ): Promise<T | null> {
                const results = await sourceDb.query(sourcePrimaryTable, pk, sk);
                return results.length > 0 ? (results[0] as unknown as T) : null;
            }
        };

        return { ctx, commands };
    }
}

export const BaseTransformContextFactory =
    BaseTransformContextFactoryAbstraction.createImplementation({
        implementation: BaseTransformContextFactoryImpl,
        dependencies: [SourceDynamoDbClient, ModelProvider, MigrationConfig, Cache]
    });
