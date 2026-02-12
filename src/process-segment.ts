import { DynamoDBClient } from "./database/dynamodb-client.ts";
import { S3Client } from "./storage/s3-client.ts";
import { executeCommands } from "./core/executor.ts";
import { createLogger } from "./utils/logger.ts";
import { fetchTenantsWithLocales, isDefaultLocaleRecord } from "./utils/tenants.ts";
import { MigrationConfig } from "./core/types.ts";
import { ModelProvider } from "./models/model-provider.ts";
import { MigrationRunner } from "./core/runner.ts";
import { loadPreset } from "./presets/loader.ts";

// ============================================================================
// Process Segment Command
// ============================================================================

export interface ProcessSegmentOptions {
  runId: string;
  segment: number;
  total: number;
  sourcePrimaryTable: string;
  targetPrimaryTable: string;
  sourceFmBucket: string;
  targetFmBucket: string;
  modelsDir?: string;
  preset: string;
}

export async function processSegment(options: ProcessSegmentOptions): Promise<void> {
  const logger = createLogger({
    msgPrefix: `[segment #${options.segment}] `
  });

  logger.info(
    `Starting segment ${options.segment} of ${options.total} (${Math.round(
      (options.segment / options.total) * 100
    )}%)`
  );

  // Initialize clients
  const database = new DynamoDBClient();
  const storage = new S3Client();

  // Fetch tenants and default locales
  logger.info("Fetching tenants and default locales...");
  const tenantLocales = await fetchTenantsWithLocales(database, options.sourcePrimaryTable);
  logger.info(`Found ${tenantLocales.size} tenants`);

  // Initialize and preload model provider
  logger.info("Preloading models...");
  const modelProvider = new ModelProvider(database, options.sourcePrimaryTable, options.modelsDir);
  await modelProvider.preloadModels(tenantLocales);

  // Create migration config
  const config: MigrationConfig = {
    sourcePrimaryTable: options.sourcePrimaryTable,
    targetPrimaryTable: options.targetPrimaryTable,
    sourceFmBucket: options.sourceFmBucket,
    targetFmBucket: options.targetFmBucket,
    modelProvider
  };

  // Load and configure preset
  logger.info(`Loading preset: ${options.preset}`);
  const preset = await loadPreset(options.preset);
  logger.info(`Loaded preset: "${preset.name}" - ${preset.description}`);

  // Create migration runner and configure with preset
  const runner = new MigrationRunner(config, database);
  preset.configure(runner, config, database);

  // Process records
  let processedCount = 0;
  let migratedCount = 0;
  let skippedCount = 0;
  const batchSize = 100;
  const recordBatch: Array<Record<string, unknown>> = [];

  logger.info("Scanning table segment...");

  for await (const record of database.scan(options.sourcePrimaryTable, {
    segment: options.segment,
    totalSegments: options.total
  })) {
    processedCount++;

    // Filter: only process default locale records
    if (!isDefaultLocaleRecord(record, tenantLocales)) {
      skippedCount++;
      continue;
    }

    recordBatch.push(record);

    // Process in batches
    if (recordBatch.length >= batchSize) {
      const commands = await runner.processAll(recordBatch);

      if (commands.length > 0) {
        await executeCommands(commands, { database, storage });
        migratedCount += recordBatch.length;
      } else {
        skippedCount += recordBatch.length;
      }

      recordBatch.length = 0;

      // Log progress
      if (processedCount % 1000 === 0) {
        logger.info(
          `Progress: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
        );
      }
    }
  }

  // Process remaining records
  if (recordBatch.length > 0) {
    const commands = await runner.processAll(recordBatch);

    if (commands.length > 0) {
      await executeCommands(commands, { database, storage });
      migratedCount += recordBatch.length;
    } else {
      skippedCount += recordBatch.length;
    }
  }

  logger.info(
    `Segment ${
      options.segment
    } completed: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
  );
}
