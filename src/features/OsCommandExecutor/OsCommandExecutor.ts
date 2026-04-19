import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/abstractions/GzipCompression.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { isRetryableAwsError } from "~/base/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { OsRecord } from "~/features/OsScanner/abstractions/OsScanner.ts";
import { OsCommandExecutor as OsCommandExecutorAbstraction } from "./abstractions/OsCommandExecutor.ts";

const DEFAULT_RETRY_SCHEDULE = [5000, 10000, 20000, 30000, 30000];
const DEFAULT_REFRESH_INTERVAL = "1s";
const DISABLED_REFRESH_INTERVAL = "-1";

// Target-shape record: same envelope as the scanner-yielded OsRecord but with
// `data` replaced by the gzipped form that actually lands in DDB.
interface OsTargetRecord extends BaseRecord {
    index: string;
    data: GzipCompression.Compressed;
}

class OsCommandExecutorImpl implements OsCommandExecutorAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly targetDb: TargetDynamoDbClient.Interface,
        private readonly osClient: OpenSearchClient.Interface,
        private readonly gzip: GzipCompression.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public async execute(records: OsRecord[], touchedIndexes: Map<string, string>): Promise<void> {
        if (records.length === 0) {
            this.logger.info("No records to execute");
            return;
        }

        if (this.config.storage !== "os") {
            throw new Error("OsCommandExecutor can only be used in os mode");
        }

        const targetTable = this.config.target.opensearch.tableName;
        const targetRecords = await this.buildTargetRecords(records);

        const uniqueIndexes = new Set(targetRecords.map(r => r.index));
        for (const indexName of uniqueIndexes) {
            await this.ensureIndex(indexName, touchedIndexes);
        }

        await this.targetDb.batchPut(targetTable, targetRecords);
    }

    private async buildTargetRecords(records: OsRecord[]): Promise<OsTargetRecord[]> {
        return Promise.all(
            records.map(async record => ({
                ...record,
                data: await this.gzip.compress(record.data)
            }))
        );
    }

    private async ensureIndex(
        indexName: string,
        touchedIndexes: Map<string, string>
    ): Promise<void> {
        if (touchedIndexes.has(indexName)) {
            return;
        }

        try {
            await this.withRetry(async () => {
                const exists = await this.osClient.indexExists(indexName);
                if (exists) {
                    await this.disableRefreshOnExisting(indexName, touchedIndexes);
                    return;
                }
                await this.createNewIndex(indexName, touchedIndexes);
            }, `ensureIndex("${indexName}")`);
        } catch (error) {
            if (!isRetryableAwsError(error)) {
                throw error;
            }
            this.logger.error(
                `Failed to ensure index "${indexName}" after retries. Continuing without index creation. Error: ${error}`
            );
        }
    }

    private async disableRefreshOnExisting(
        indexName: string,
        touchedIndexes: Map<string, string>
    ): Promise<void> {
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

        touchedIndexes.set(indexName, originalRefresh);
    }

    private async createNewIndex(
        indexName: string,
        touchedIndexes: Map<string, string>
    ): Promise<void> {
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

        // New indexes were created with "-1"; "1s" is the default we'll restore to
        touchedIndexes.set(indexName, DEFAULT_REFRESH_INTERVAL);
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

export const OsCommandExecutor = OsCommandExecutorAbstraction.createImplementation({
    implementation: OsCommandExecutorImpl,
    dependencies: [Logger, TargetDynamoDbClient, OpenSearchClient, GzipCompression, MigrationConfig]
});
