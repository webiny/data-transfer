import { join } from "node:path";
import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration";
import { isRetryableAwsError } from "~/base/index.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/abstractions/GzipCompression.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

const DEFAULT_RETRY_SCHEDULE: number[] = [5000, 10000, 20000, 30000, 30000];
const DEFAULT_REFRESH_INTERVAL = "1s";
const DISABLED_REFRESH_INTERVAL = "-1";
const DEFAULT_GZIP_CONCURRENCY = 16;

interface OsProcessorSlice {
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

class OsProcessorImpl implements Processor.Interface<
    BaseTransformContext.Interface<unknown>,
    OsProcessorSlice
> {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly ddbExecutor: DdbExecutor.Interface,
        private readonly osClient: OpenSearchClient.Interface,
        private readonly gzip: GzipCompression.Interface,
        private readonly touchedIndexes: TouchedIndexes.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly transferContext: TransferContext.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface,
        private readonly sourceDb: SourceDynamoDbClient.Interface,
        private readonly targetDb: TargetDynamoDbClient.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): OsProcessorSlice {
        if (this.config.storage !== "os") {
            throw new Error("OsProcessor can only be used in os mode");
        }
        const sourceTable = this.config.source.opensearch.tableName;
        const targetTable = this.config.target.opensearch.tableName;
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

    public onEnd(ctx: BaseTransformContext.Interface<unknown> & OsProcessorSlice): void {
        ctx.putRecord(ctx.record as Record<string, unknown>);
    }

    public async execute(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        if (puts.length === 0) {
            return;
        }

        const gzippedPuts = await this.buildGzippedPuts(puts);

        const uniqueIndexes = new Set<string>(puts.map(put => put.record.index as string));
        for (const indexName of uniqueIndexes) {
            await this.ensureIndex(indexName);
        }

        await this.ddbExecutor.execute(gzippedPuts);
    }

    public afterShard(ctx: Processor.AfterShardContext): void {
        const items = this.touchedIndexes.all();
        if (items.length === 0) {
            return;
        }
        const transferDir = join(process.cwd(), ".transfer", this.transferContext.runId);
        this.dirTool.create(transferDir);
        const stateFile = join(transferDir, `${ctx.segment}-indexes.json`);
        this.fileTool.writeFileOrThrow(stateFile, JSON.stringify(items));
    }

    private async buildGzippedPuts(puts: PutRecord[]): Promise<PutRecord[]> {
        const concurrency = this.gzipConcurrency;
        const result: PutRecord[] = new Array(puts.length);

        for (let i = 0; i < puts.length; i += concurrency) {
            const slice = puts.slice(i, i + concurrency);
            const gzipped = await Promise.all(
                slice.map(async put => {
                    const compressed = await this.gzip.compress(put.record.data);
                    return PutRecord.create({
                        table: put.table,
                        record: {
                            ...put.record,
                            data: compressed
                        }
                    });
                })
            );
            for (let j = 0; j < gzipped.length; j++) {
                result[i + j] = gzipped[j];
            }
        }

        return result;
    }

    private async ensureIndex(indexName: string): Promise<void> {
        if (this.touchedIndexes.has(indexName)) {
            return;
        }

        await this.withRetry(async () => {
            const exists = await this.osClient.indexExists(indexName);
            if (exists) {
                await this.disableRefreshOnExisting(indexName);
                return;
            }
            await this.createNewIndex(indexName);
        }, `ensureIndex("${indexName}")`);
    }

    private async disableRefreshOnExisting(indexName: string): Promise<void> {
        const current = await this.osClient.getIndexSettings(indexName);
        const originalRefresh = current.refreshInterval ?? DEFAULT_REFRESH_INTERVAL;

        try {
            await this.osClient.putIndexSettings(indexName, {
                index: { refresh_interval: DISABLED_REFRESH_INTERVAL }
            });
            this.logger.info(
                `Disabled refresh on existing index: ${indexName} (was: ${originalRefresh})`
            );
        } catch (settingsError) {
            this.logger.warn(
                `Failed to disable refresh on index: ${indexName}. Continuing. Error: ${settingsError}`
            );
        }

        this.touchedIndexes.record(indexName, originalRefresh);
    }

    private async createNewIndex(indexName: string): Promise<void> {
        try {
            const baseConfig = getBaseConfiguration();
            await this.osClient.createIndex(indexName, {
                mappings: baseConfig.mappings,
                settings: {
                    index: {
                        refresh_interval: DISABLED_REFRESH_INTERVAL
                    }
                }
            });
            this.logger.info(`Created index: ${indexName}`);
        } catch (createError) {
            if (this.isAlreadyExistsError(createError)) {
                this.logger.info(`Index already exists (race condition): ${indexName}`);
            } else {
                throw createError;
            }
        }

        // New indexes were created with "-1"; "1s" is the default we'll restore to.
        this.touchedIndexes.record(indexName, DEFAULT_REFRESH_INTERVAL);
    }

    private async withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
        let lastError: Error | undefined;
        const schedule = this.retrySchedule;

        for (let attempt = 0; attempt <= schedule.length; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;
                if (!isRetryableAwsError(error)) {
                    throw error;
                }
                if (attempt < schedule.length) {
                    const wait = schedule[attempt];
                    this.logger.warn(
                        `${label} failed (attempt ${attempt + 1}/${schedule.length + 1}). Retrying in ${wait / 1000}s...`
                    );
                    await new Promise(resolve => setTimeout(resolve, wait));
                }
            }
        }

        throw lastError;
    }

    private isAlreadyExistsError(error: unknown): boolean {
        if (!error || typeof error !== "object") {
            return false;
        }
        const maybeMeta = (error as { meta?: { body?: { error?: { type?: string } } } }).meta;
        if (maybeMeta?.body?.error?.type === "resource_already_exists_exception") {
            return true;
        }
        const message = (error as { message?: string }).message ?? "";
        return message.includes("resource_already_exists_exception");
    }

    private get retrySchedule(): number[] {
        return this.config.tuning?.os?.retryScheduleMs ?? DEFAULT_RETRY_SCHEDULE;
    }

    private get gzipConcurrency(): number {
        return this.config.tuning?.os?.gzipConcurrency ?? DEFAULT_GZIP_CONCURRENCY;
    }
}

export const OsProcessor = Processor.createImplementation({
    implementation: OsProcessorImpl,
    dependencies: [
        Logger,
        DdbExecutor,
        OpenSearchClient,
        GzipCompression,
        TouchedIndexes,
        MigrationConfig,
        TransferContext,
        DirectoryTool,
        FileTool,
        SourceDynamoDbClient,
        TargetDynamoDbClient
    ]
});
