import { join } from "node:path";
import { bootstrap } from "~/bootstrap.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/index.ts";
import { ModelProvider } from "~/features/ModelProvider/index.ts";
import { TenantLocales } from "~/features/TenantLocales/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { OsCommandExecutor } from "~/features/OsCommandExecutor/index.ts";
import { OsRecordDecompressor } from "~/features/OsRecordDecompressor/index.ts";
import { FileTool } from "~/tools/FileTool/index.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

interface ProcessOsSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

const BATCH_SIZE = 100;
const PROGRESS_LOG_EVERY = 1000;

export async function handler(argv: ProcessOsSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    if (config.storage !== "os") {
        throw new Error(`process-os-segment requires storage: "os". Got: "${config.storage}"`);
    }

    const container = bootstrap({ config });

    const logger = container.resolve(Logger).child(`[os-segment #${argv.segment}] `);

    logger.info(
        `Starting OS segment ${argv.segment} of ${argv.total} (${Math.round(
            (argv.segment / argv.total) * 100
        )}%)`
    );

    const tenantLocales = container.resolve(TenantLocales);
    logger.info("Fetching tenants and default locales...");
    await tenantLocales.preload();
    logger.info(`Found ${tenantLocales.getMap().size} tenants`);

    const modelProvider = container.resolve(ModelProvider);
    logger.info("Preloading models...");
    await modelProvider.preloadModels(tenantLocales.getMap());

    const presetLoader = container.resolve(PresetLoader);
    logger.info(`Loading preset: ${config.pipeline.preset}`);
    const preset = await presetLoader.load(config.pipeline.preset);
    logger.info(`Loaded preset: "${preset.name}" - ${preset.description}`);

    const runner = container.resolve(PipelineRunner);
    preset.configure(runner);

    const sourceDb = container.resolve(SourceDynamoDbClient);
    const decompressor = container.resolve(OsRecordDecompressor);
    const executor = container.resolve(OsCommandExecutor);
    const fileTool = container.resolve(FileTool);

    const touchedIndexes = new Map<string, string>();
    const items: OsCommandExecutor.Item[] = [];

    let processedCount = 0;
    let migratedCount = 0;
    let skippedCount = 0;

    const flush = async (): Promise<void> => {
        if (items.length === 0) {
            return;
        }
        await executor.execute(items, touchedIndexes);
        migratedCount += items.length;
        items.length = 0;
    };

    logger.info(`Scanning OS table: ${config.source.opensearch.tableName}...`);

    for await (const osRecord of sourceDb.scan(config.source.opensearch.tableName, {
        segment: argv.segment,
        totalSegments: argv.total
    })) {
        processedCount++;

        const decompressed = await decompressor.decompress(osRecord);
        if (!decompressed) {
            skippedCount++;
            continue;
        }

        if (!tenantLocales.isDefaultLocaleRecord(decompressed.record)) {
            skippedCount++;
            continue;
        }

        const commands = await runner.processRecord(decompressed.record as BaseRecord);
        const puts = commands.get<PutRecord>(PutRecord.key);
        if (puts.length === 0) {
            skippedCount++;
            continue;
        }

        for (const putCmd of puts) {
            items.push({
                record: putCmd.record as BaseRecord,
                metadata: decompressed.metadata,
                locale: decompressed.locale
            });
        }

        if (items.length >= BATCH_SIZE) {
            await flush();

            if (processedCount % PROGRESS_LOG_EVERY === 0) {
                logger.info(
                    `Progress: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
                );
            }
        }
    }

    await flush();

    logger.info(
        `OS segment ${argv.segment} completed: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
    );

    if (touchedIndexes.size > 0) {
        const filePath = join(
            process.cwd(),
            ".transfer",
            argv.runId,
            `segment-${argv.segment}-indexes.json`
        );
        const indexData = Object.fromEntries(touchedIndexes);
        fileTool.writeFile(filePath, JSON.stringify(indexData, null, 2));
        logger.info(`Wrote ${touchedIndexes.size} touched indexes to ${filePath}`);
    }
}
