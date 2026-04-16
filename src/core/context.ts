import { Command, MigrationConfig, TransformContext } from "./types.ts";
import { DatabaseClient } from "../database/interface.ts";

export function createContext<T extends Record<string, unknown>>(
    record: T,
    config: MigrationConfig,
    database: DatabaseClient,
    cache?: Map<string, unknown>
): TransformContext<T> {
    const commands: Command[] = [];

    const ctx: TransformContext<any> = {
        record: structuredClone(record),
        original: Object.freeze(structuredClone(record)),
        commands,
        modelProvider: config.modelProvider,
        cache: cache ?? new Map(),
        replace(newRecord) {
            ctx.record = newRecord;
        },
        putPrimaryRecord(record: Record<string, unknown>) {
            commands.push({
                type: "PUT_RECORD",
                table: config.targetPrimaryTable,
                record
            });
        },
        copyFile(sourceKey: string, targetKey: string) {
            commands.push({
                type: "S3_COPY",
                sourceBucket: config.sourceFmBucket,
                sourceKey,
                targetBucket: config.targetFmBucket,
                targetKey
            });
        },
        async queryRecord(pk: string, sk?: string) {
            const results = await database.query(config.sourcePrimaryTable, pk, sk);
            return results.length > 0 ? results[0] : null;
        },
        async executePipeline(pipeline: any, records: Record<string, unknown>[]) {
            const allCommands: Command[] = [];

            for (const record of records) {
                const result = await pipeline.run(record, config, database);
                if (result) {
                    allCommands.push(...result.commands);
                }
            }

            // Merge all commands into parent context
            commands.push(...allCommands);
            return allCommands;
        },
        async getFile(key: string) {
            if (!config.sourceStorage) {
                return null;
            }
            return config.sourceStorage.getObject(config.sourceFmBucket, key);
        }
    };

    return ctx;
}
