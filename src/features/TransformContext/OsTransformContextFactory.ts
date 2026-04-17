import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Command } from "~/domain/transform/types/commands.ts";
import { BaseTransformContextFactory } from "./abstractions/BaseTransformContext.ts";
import {
    OsTransformContext as OsTransformContextAbstraction,
    OsTransformContextFactory as OsTransformContextFactoryAbstraction
} from "./abstractions/OsTransformContext.ts";
import { SourceDynamoDbClient } from "~/features/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { Cache } from "~/features/Cache/abstractions/Cache.ts";

class OsTransformContextFactoryImpl implements OsTransformContextFactoryAbstraction.Interface {
    public constructor(
        private readonly sourceDb: SourceDynamoDbClient.Interface,
        private readonly modelProvider: ModelProvider.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly cache: Cache.Interface
    ) {}

    public create<T extends BaseRecord>(
        params: BaseTransformContextFactory.CreateParams<T>
    ): OsTransformContextAbstraction.Interface<T> {
        if (this.config.storage !== "os") {
            throw new Error("OsTransformContextFactory can only be used in os mode");
        }

        const commands: Command[] = [];
        const sourcePrimaryTable = this.config.source.dynamodb.tableName;
        const targetTable = this.config.target.opensearch.tableName;

        const ctx: OsTransformContextAbstraction.Interface<any> = {
            record: structuredClone(params.record),
            original: Object.freeze(structuredClone(params.record)),
            commands,
            modelProvider: this.modelProvider,
            cache: this.cache,

            replace(newRecord) {
                ctx.record = newRecord;
            },

            putRecord: (record: Record<string, unknown>) => {
                commands.push({
                    type: "PUT_RECORD",
                    table: targetTable,
                    record
                });
            },

            queryRecord: async (pk: string, sk?: string) => {
                const results = await this.sourceDb.query(sourcePrimaryTable, pk, sk);
                return results.length > 0 ? (results[0] as Record<string, unknown>) : null;
            },

            executePipeline: async (pipeline: any, records: Record<string, unknown>[]) => {
                const allCommands: Command[] = [];

                for (const record of records) {
                    const result = await pipeline.run(record, this.config, this.sourceDb);
                    if (result) {
                        allCommands.push(...result.commands);
                    }
                }

                commands.push(...allCommands);
                return allCommands;
            }
        };

        return ctx;
    }
}

export const OsTransformContextFactory = OsTransformContextFactoryAbstraction.createImplementation({
    implementation: OsTransformContextFactoryImpl,
    dependencies: [SourceDynamoDbClient, ModelProvider, MigrationConfig, Cache]
});
