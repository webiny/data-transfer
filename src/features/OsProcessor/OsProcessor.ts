import { join } from "node:path";
import { Container } from "@webiny/di";
import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration/index.js";
import { isRetryableAwsError, ContainerToken } from "~/base/index.ts";
import { IndexConfigurationProvider } from "~/features/IndexConfigurationProvider/abstractions/IndexConfigurationProvider.ts";
import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

interface OpenSearchErrorLike {
    statusCode?: number;
}

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
    private _osClient: OpenSearchClient.Interface | null = null;

    public constructor(
        private readonly logger: Logger.Interface,
        private readonly ddbExecutor: DdbExecutor.Interface,
        private readonly container: Container,
        private readonly compression: CompressionHandler.Interface,
        private readonly touchedIndexes: TouchedIndexes.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly transferContext: TransferContext.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface,
        private readonly sourceDb: SourceDynamoDbClient.Interface,
        private readonly targetDb: TargetDynamoDbClient.Interface,
        private readonly indexConfigurationProvider: IndexConfigurationProvider.Interface
    ) {}

    private get osClient(): OpenSearchClient.Interface {
        if (!this._osClient) {
            this._osClient = this.container.resolve(OpenSearchClient);
        }
        return this._osClient;
    }

    public extendContext(base: BaseTransformContext.Interface<unknown>): OsProcessorSlice {
        if (!this.config.target.opensearch) {
            throw new Error("OsProcessor: config.target.opensearch is not configured.");
        }
        if (!this.config.source.opensearch) {
            throw new Error("OsProcessor: config.source.opensearch is not configured.");
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
        if (this.transferContext.dryRun) {
            return;
        }
        const puts = commands.get<PutRecord>(PutRecord.key);
        if (puts.length === 0) {
            return;
        }

        const gzippedPuts = await this.buildGzippedPuts(puts);

        const uniqueIndexes = new Set<string>(puts.map(put => put.record.index as string));
        for (const indexName of uniqueIndexes) {
            await this.ensureIndex(indexName);
        }

        this.logger.info(`Writing ${gzippedPuts.length} records to database`);
        await this.ddbExecutor.execute(gzippedPuts);
    }

    public async checkAccess(): Promise<AccessCheck.Entry[]> {
        if (!this.config.target.opensearch) {
            return [];
        }
        // Source OS data is read indirectly via the source DDB table; no source-side OS probe needed.
        const endpoint = this.config.target.opensearch.endpoint;
        const label = `OpenSearch cluster: ${endpoint}`;
        try {
            await this.osClient.listIndexes();
            return [{ label, status: "ok" }];
        } catch (error) {
            const statusCode = (error as OpenSearchErrorLike).statusCode;
            if (statusCode === 401 || statusCode === 403) {
                return [{ label, status: "denied" }];
            }
            if (statusCode === 404) {
                return [{ label, status: "missing" }];
            }
            return [{ label, status: "unknown" }];
        }
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
                    const compressed = await this.compression.compress(put.record.data);
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
        const originalRefresh =
            current.refreshInterval && current.refreshInterval !== DISABLED_REFRESH_INTERVAL
                ? current.refreshInterval
                : DEFAULT_REFRESH_INTERVAL;

        const base = this.getBaseIndexConfiguration();
        const resolved = this.indexConfigurationProvider.getConfiguration(indexName, base);
        const resolvedIndexSettings =
            (resolved.settings?.index as Record<string, unknown> | undefined) ?? {};

        try {
            await this.osClient.putIndexSettings(indexName, {
                index: {
                    ...resolvedIndexSettings,
                    refresh_interval: DISABLED_REFRESH_INTERVAL
                }
            });
            this.logger.info(
                `Disabled refresh on existing index: ${indexName} (was: ${originalRefresh})`
            );
        } catch (settingsError) {
            this.logger.warn(
                `Failed to update settings on index: ${indexName}. Continuing. Error: ${settingsError}`
            );
        }

        this.touchedIndexes.record(indexName, originalRefresh);
    }

    private async createNewIndex(indexName: string): Promise<void> {
        try {
            const base = this.getBaseIndexConfiguration();
            const resolved = this.indexConfigurationProvider.getConfiguration(indexName, base);
            const resolvedIndexSettings =
                (resolved.settings?.index as Record<string, unknown> | undefined) ?? {};

            await this.osClient.createIndex(indexName, {
                mappings: resolved.mappings,
                settings: {
                    index: {
                        ...resolvedIndexSettings,
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

    private getBaseIndexConfiguration(): IndexConfigurationProvider.Configuration {
        const baseConfig = getBaseConfiguration();
        return {
            mappings: baseConfig.mappings as Record<string, unknown> | undefined
        };
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
        ContainerToken,
        CompressionHandler,
        TouchedIndexes,
        MigrationConfig,
        TransferContext,
        DirectoryTool,
        FileTool,
        SourceDynamoDbClient,
        TargetDynamoDbClient,
        IndexConfigurationProvider
    ]
});
