import { bootstrap } from "~/bootstrap.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/index.ts";
import { ModelProvider } from "~/features/ModelProvider/index.ts";
import { TenantLocales } from "~/features/TenantLocales/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

interface ProcessSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

const BATCH_SIZE = 100;
const PROGRESS_LOG_EVERY = 1000;

export async function handler(argv: ProcessSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    if (config.storage !== "ddb") {
        throw new Error(`process-segment requires storage: "ddb". Got: "${config.storage}"`);
    }

    const container = bootstrap({ config });

    const logger = container.resolve(Logger).child(`[segment #${argv.segment}] `);

    logger.info(
        `Starting segment ${argv.segment} of ${argv.total} (${Math.round(
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

    const executor = container.resolve(DdbCommandExecutor);
    const sourceDb = container.resolve(SourceDynamoDbClient);

    let processedCount = 0;
    let migratedCount = 0;
    let skippedCount = 0;
    const recordBatch: BaseRecord[] = [];

    const flush = async (): Promise<void> => {
        if (recordBatch.length === 0) {
            return;
        }
        const commands = await runner.processAll(recordBatch);
        if (commands.size() > 0) {
            await executor.execute(commands);
            migratedCount += recordBatch.length;
        } else {
            skippedCount += recordBatch.length;
        }
        recordBatch.length = 0;
    };

    logger.info("Scanning table segment...");

    for await (const record of sourceDb.scan(config.source.dynamodb.tableName, {
        segment: argv.segment,
        totalSegments: argv.total
    })) {
        processedCount++;

        if (!tenantLocales.isDefaultLocaleRecord(record)) {
            skippedCount++;
            continue;
        }

        recordBatch.push(record);

        if (recordBatch.length >= BATCH_SIZE) {
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
        `Segment ${argv.segment} completed: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
    );
}
