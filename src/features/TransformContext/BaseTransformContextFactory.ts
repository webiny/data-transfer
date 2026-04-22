import { Commands } from "~/domain/transform/commands/Commands.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { Cache } from "~/tools/Cache/abstractions/Cache.ts";
import {
    BaseTransformContext as BaseTransformContextAbstraction,
    BaseTransformContextFactory as BaseTransformContextFactoryAbstraction
} from "./abstractions/BaseTransformContext.ts";

class BaseTransformContextFactoryImpl implements BaseTransformContextFactoryAbstraction.Interface {
    public constructor(
        private readonly sourceDb: SourceDynamoDbClient.Interface,
        private readonly targetDb: TargetDynamoDbClient.Interface,
        private readonly modelProvider: ModelProvider.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly cache: Cache.Interface
    ) {}

    public create<TRecord>(
        params: BaseTransformContextFactoryAbstraction.CreateParams<TRecord>
    ): BaseTransformContextFactoryAbstraction.CreateResult<TRecord> {
        const commands = new Commands();
        const sourcePrimaryTable = this.config.source.dynamodb.tableName;
        // OS transfers have no target primary DDB table — the target is an
        // OpenSearch companion. Leave undefined here and let
        // queryTargetRecord throw at call time, rather than silently routing
        // to the wrong table.
        const targetPrimaryTable =
            this.config.storage === "ddb" ? this.config.target.dynamodb.tableName : undefined;
        const sourceDb = this.sourceDb;
        const targetDb = this.targetDb;
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
            },
            async queryTargetRecord<T extends Record<string, unknown> = Record<string, unknown>>(
                pk: string,
                sk?: string
            ): Promise<T | null> {
                if (!targetPrimaryTable) {
                    throw new Error(
                        "ctx.queryTargetRecord is only available in DDB transfers — " +
                            "OS transfers have no target primary DDB table to query."
                    );
                }
                const results = await targetDb.query(targetPrimaryTable, pk, sk);
                return results.length > 0 ? (results[0] as unknown as T) : null;
            }
        };

        return { ctx, commands };
    }
}

export const BaseTransformContextFactory =
    BaseTransformContextFactoryAbstraction.createImplementation({
        implementation: BaseTransformContextFactoryImpl,
        dependencies: [
            SourceDynamoDbClient,
            TargetDynamoDbClient,
            ModelProvider,
            MigrationConfig,
            Cache
        ]
    });
