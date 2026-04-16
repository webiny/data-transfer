import { DynamoDBClient } from "../../database/dynamodb-client.ts";
import { S3Client } from "../../storage/s3-client.ts";
import { executeCommands } from "../../core/executor.ts";
import { createLogger } from "../../utils/logger.ts";
import { fetchTenantsWithLocales, isDefaultLocaleRecord } from "../../utils/tenants.ts";
import { MigrationConfig } from "../../core/types.ts";
import { ModelProvider } from "../../models/model-provider.ts";
import { MigrationRunner } from "../../core/runner.ts";
import { loadPreset } from "../../core/preset-loader.ts";
import { loadConfig } from "../../features/MigrationConfig/loadConfig.ts";

interface ProcessSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

export async function handler(argv: ProcessSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    if (config.storage !== "ddb") {
        throw new Error(`process-segment requires storage: "ddb". Got: "${config.storage}"`);
    }

    const logger = createLogger({
        msgPrefix: `[segment #${argv.segment}] `
    });

    logger.info(
        `Starting segment ${argv.segment} of ${argv.total} (${Math.round(
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

    const targetStorage = new S3Client({
        region: config.target.region,
        credentials: config.target.credentials
    });

    const sourceStorage = new S3Client({
        region: config.source.region,
        credentials: config.source.credentials
    });

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
        targetPrimaryTable: config.target.dynamodb.tableName,
        sourceFmBucket: config.source.s3.bucket,
        targetFmBucket: config.target.s3.bucket,
        modelProvider,
        sourceStorage
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
    const recordBatch: Array<Record<string, unknown>> = [];

    logger.info("Scanning table segment...");

    for await (const record of sourceDatabase.scan(config.source.dynamodb.tableName, {
        segment: argv.segment,
        totalSegments: argv.total
    })) {
        processedCount++;

        if (!isDefaultLocaleRecord(record, tenantLocales)) {
            skippedCount++;
            continue;
        }

        recordBatch.push(record);

        if (recordBatch.length >= batchSize) {
            const commands = await runner.processAll(recordBatch);

            if (commands.length > 0) {
                await executeCommands(commands, {
                    database: targetDatabase,
                    storage: targetStorage
                });
                migratedCount += recordBatch.length;
            } else {
                skippedCount += recordBatch.length;
            }

            recordBatch.length = 0;

            if (processedCount % 1000 === 0) {
                logger.info(
                    `Progress: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
                );
            }
        }
    }

    if (recordBatch.length > 0) {
        const commands = await runner.processAll(recordBatch);

        if (commands.length > 0) {
            await executeCommands(commands, { database: targetDatabase, storage: targetStorage });
            migratedCount += recordBatch.length;
        } else {
            skippedCount += recordBatch.length;
        }
    }

    logger.info(
        `Segment ${argv.segment} completed: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
    );
}
