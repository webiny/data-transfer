import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { DynamoDBClient } from "../database/dynamodb-client.ts";
import { createLogger } from "../utils/logger.ts";
import { fetchTenantsWithLocales, isDefaultLocaleRecord } from "../utils/tenants.ts";
import { MigrationConfig, PutRecordCommand } from "../core/types.ts";
import { ModelProvider } from "../models/model-provider.ts";
import { MigrationRunner } from "../core/runner.ts";
import { loadPreset } from "../core/preset-loader.ts";
import { decompressOsRecord } from "../opensearch/decompress-record.ts";
import { executeOsCommands, type OsCommandItem } from "../opensearch/executor.ts";
import { createOpenSearchClient, type Client } from "../opensearch/client.ts";
import { isTransformedRecord } from "../utils/record-guards.ts";
import { loadConfig } from "../features/MigrationConfig/loadConfig.ts";

interface ProcessOsSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

export async function runProcessOsSegment(argv: ProcessOsSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    if (config.storage !== "os") {
        throw new Error(`process-os-segment requires storage: "os". Got: "${config.storage}"`);
    }

    const logger = createLogger({
        msgPrefix: `[os-segment #${argv.segment}] `
    });

    logger.info(
        `Starting OS segment ${argv.segment} of ${argv.total} (${Math.round(
            (argv.segment / argv.total) * 100
        )}%)`
    );

    const sourceDatabase = new DynamoDBClient({
        region: config.source.region,
        credentials: config.source.credentials
    });

    const targetDatabase = new DynamoDBClient({
        region: config.target.region,
        credentials: config.target.credentials
    });

    const osClient = createOpenSearchClient({
        endpoint: config.target.opensearch.endpoint,
        region: config.target.region,
        service: config.target.opensearch.service,
        credentials: config.target.credentials
    });

    const touchedIndexes = new Map<string, string>();

    logger.info("Fetching tenants and default locales...");
    const tenantLocales = await fetchTenantsWithLocales(
        sourceDatabase,
        config.source.dynamodb.tableName
    );
    logger.info(`Found ${tenantLocales.size} tenants`);

    logger.info("Preloading models...");
    const modelProvider = new ModelProvider(
        sourceDatabase,
        config.source.dynamodb.tableName,
        config.migration.modelsDir
    );
    await modelProvider.preloadModels(tenantLocales);

    const migrationConfig: MigrationConfig = {
        sourcePrimaryTable: config.source.dynamodb.tableName,
        targetPrimaryTable: config.target.opensearch.tableName,
        sourceFmBucket: "",
        targetFmBucket: "",
        modelProvider
    };

    logger.info(`Loading preset: ${config.migration.preset}`);
    const preset = await loadPreset(config.migration.preset);
    logger.info(`Loaded preset: "${preset.name}" - ${preset.description}`);

    const runner = new MigrationRunner(migrationConfig, sourceDatabase);
    preset.configure(runner, migrationConfig, sourceDatabase);

    let processedCount = 0;
    let migratedCount = 0;
    let skippedCount = 0;
    const batchSize = 100;

    const batch: Array<{
        record: Record<string, unknown>;
        metadata: { index: string; _ct: string; _md: string };
        locale: string;
    }> = [];

    logger.info(`Scanning OS table: ${config.source.opensearch.tableName}...`);

    for await (const record of sourceDatabase.scan(config.source.opensearch.tableName, {
        segment: argv.segment,
        totalSegments: argv.total
    })) {
        processedCount++;

        const decompressed = await decompressOsRecord(record);
        if (!decompressed) {
            skippedCount++;
            continue;
        }

        if (!isDefaultLocaleRecord(decompressed.record, tenantLocales)) {
            skippedCount++;
            continue;
        }

        const locale = extractLocaleFromPk(decompressed.record.PK as string) || "en-US";

        batch.push({
            record: decompressed.record,
            metadata: decompressed.metadata,
            locale
        });

        if (batch.length >= batchSize) {
            const migrated = await processOsBatch(
                batch,
                runner,
                targetDatabase,
                config.target.opensearch.tableName,
                osClient,
                touchedIndexes,
                logger
            );
            migratedCount += migrated;
            skippedCount += batch.length - migrated;
            batch.length = 0;

            if (processedCount % 1000 === 0) {
                logger.info(
                    `Progress: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
                );
            }
        }
    }

    if (batch.length > 0) {
        const migrated = await processOsBatch(
            batch,
            runner,
            targetDatabase,
            config.target.opensearch.tableName,
            osClient,
            touchedIndexes,
            logger
        );
        migratedCount += migrated;
        skippedCount += batch.length - migrated;
    }

    logger.info(
        `OS segment ${argv.segment} completed: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
    );

    if (touchedIndexes.size > 0) {
        const transferDir = join(process.cwd(), ".transfer", argv.runId);
        await mkdir(transferDir, { recursive: true });

        const indexData = Object.fromEntries(touchedIndexes);
        const filePath = join(transferDir, `segment-${argv.segment}-indexes.json`);
        await writeFile(filePath, JSON.stringify(indexData, null, 2));
        logger.info(`Wrote ${touchedIndexes.size} touched indexes to ${filePath}`);
    }
}

// ============================================================================
// Helpers
// ============================================================================

async function processOsBatch(
    batch: Array<{
        record: Record<string, unknown>;
        metadata: { index: string; _ct: string; _md: string };
        locale: string;
    }>,
    runner: MigrationRunner,
    targetDatabase: DynamoDBClient,
    targetTable: string,
    osClient: Client,
    touchedIndexes: Map<string, string>,
    logger: { warn: (msg: string) => void }
): Promise<number> {
    const osItems: OsCommandItem[] = [];

    for (const item of batch) {
        const commands = await runner.processRecord(item.record);

        for (const cmd of commands) {
            if (cmd.type === "PUT_RECORD") {
                const record = (cmd as PutRecordCommand).record;
                if (!isTransformedRecord(record)) {
                    logger.warn(
                        `Skipping record with invalid shape after pipeline: PK=${record.PK}, SK=${record.SK}`
                    );
                    continue;
                }
                osItems.push({
                    record,
                    metadata: item.metadata,
                    locale: item.locale
                });
            }
        }
    }

    await executeOsCommands(osItems, {
        database: targetDatabase,
        targetTable,
        osClient,
        touchedIndexes
    });

    return osItems.length;
}

function extractLocaleFromPk(pk: string): string | null {
    const match = pk.match(/#L#([^#]+)#/);
    return match ? match[1] : null;
}
