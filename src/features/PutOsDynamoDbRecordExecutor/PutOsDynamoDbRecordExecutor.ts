import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration";
import { isRetryableAwsError } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/abstractions/GzipCompression.ts";
import { PutDynamoDbRecordExecutor } from "~/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { PutOsDynamoDbRecordExecutor as PutOsDynamoDbRecordExecutorAbstraction } from "./abstractions/PutOsDynamoDbRecordExecutor.ts";

const DEFAULT_RETRY_SCHEDULE: number[] = [5000, 10000, 20000, 30000, 30000];
const DEFAULT_REFRESH_INTERVAL = "1s";
const DISABLED_REFRESH_INTERVAL = "-1";

class PutOsDynamoDbRecordExecutorImpl implements PutOsDynamoDbRecordExecutorAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly osClient: OpenSearchClient.Interface,
        private readonly gzip: GzipCompression.Interface,
        private readonly putDdb: PutDynamoDbRecordExecutor.Interface,
        private readonly touchedIndexes: TouchedIndexes.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public async execute(puts: PutRecord[]): Promise<void> {
        if (puts.length === 0) {
            return;
        }

        const gzippedPuts = await this.buildGzippedPuts(puts);

        const uniqueIndexes = new Set<string>(puts.map(put => put.record.index as string));
        for (const indexName of uniqueIndexes) {
            await this.ensureIndex(indexName);
        }

        await this.putDdb.execute(gzippedPuts);
    }

    private async buildGzippedPuts(puts: PutRecord[]): Promise<PutRecord[]> {
        return Promise.all(
            puts.map(async put => {
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

    private get retrySchedule(): number[] {
        return this.config.tuning?.os?.retryScheduleMs ?? DEFAULT_RETRY_SCHEDULE;
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
}

export const PutOsDynamoDbRecordExecutor =
    PutOsDynamoDbRecordExecutorAbstraction.createImplementation({
        implementation: PutOsDynamoDbRecordExecutorImpl,
        dependencies: [
            Logger,
            OpenSearchClient,
            GzipCompression,
            PutDynamoDbRecordExecutor,
            TouchedIndexes,
            MigrationConfig
        ]
    });
