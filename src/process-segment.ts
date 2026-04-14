import { DynamoDBClient } from "./database/dynamodb-client.ts";
import { S3Client } from "./storage/s3-client.ts";
import { executeCommands } from "./core/executor.ts";
import { createLogger } from "./utils/logger.ts";
import { fetchTenantsWithLocales, isDefaultLocaleRecord } from "./utils/tenants.ts";
import { MigrationConfig } from "./core/types.ts";
import { MigrationConfiguration } from "./config/types.ts";
import { ModelProvider } from "./models/model-provider.ts";
import { MigrationRunner } from "./core/runner.ts";
import { loadPreset } from "./core/preset-loader.ts";

// ============================================================================
// Process Segment Command
// ============================================================================

export interface ProcessSegmentOptions {
  runId: string;
  segment: number;
  total: number;
  config: MigrationConfiguration;
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

  // Initialize source clients (for reading)
  const sourceDatabase = new DynamoDBClient({
    region: options.config.source.region,
    credentials: options.config.source.credentials
  });

  // Initialize target clients (for writing)
  const targetDatabase = new DynamoDBClient({
    region: options.config.target.region,
    credentials: options.config.target.credentials
  });

  const targetStorage = new S3Client({
    region: options.config.target.region,
    credentials: options.config.target.credentials
  });

  const sourceStorage = new S3Client({
    region: options.config.source.region,
    credentials: options.config.source.credentials
  });

  // Fetch tenants and default locales
  logger.info("Fetching tenants and default locales...");
  const tenantLocales = await fetchTenantsWithLocales(
    sourceDatabase,
    options.config.source.dynamodb.tableName
  );
  logger.info(`Found ${tenantLocales.size} tenants`);

  // Initialize and preload model provider
  logger.info("Preloading models...");
  const modelProvider = new ModelProvider(
    sourceDatabase,
    options.config.source.dynamodb.tableName,
    options.config.migration.modelsDir
  );
  await modelProvider.preloadModels(tenantLocales);

  // Create migration config
  const migrationConfig: MigrationConfig = {
    sourcePrimaryTable: options.config.source.dynamodb.tableName,
    targetPrimaryTable: options.config.target.dynamodb.tableName,
    sourceFmBucket: options.config.source.s3.bucket,
    targetFmBucket: options.config.target.s3.bucket,
    modelProvider,
    sourceStorage,
    ...(options.config.storage === "ddb-os" && {
      opensearch: {
        endpoint: options.config.target.opensearch.endpoint,
        targetTable: options.config.target.opensearch.tableName
      }
    })
  };

  // Load and configure preset
  logger.info(`Loading preset: ${options.config.migration.preset}`);
  const preset = await loadPreset(options.config.migration.preset);
  logger.info(`Loaded preset: "${preset.name}" - ${preset.description}`);

  // Create migration runner and configure with preset
  const runner = new MigrationRunner(migrationConfig, sourceDatabase);
  preset.configure(runner, migrationConfig, sourceDatabase);

  // Process records
  let processedCount = 0;
  let migratedCount = 0;
  let skippedCount = 0;
  const batchSize = 100;
  const recordBatch: Array<Record<string, unknown>> = [];

  logger.info("Scanning table segment...");

  for await (const record of sourceDatabase.scan(options.config.source.dynamodb.tableName, {
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
        await executeCommands(commands, { database: targetDatabase, storage: targetStorage });
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
      await executeCommands(commands, { database: targetDatabase, storage: targetStorage });
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
