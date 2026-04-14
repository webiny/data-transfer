import { DynamoDBClient } from "./database/dynamodb-client.ts";
import { createLogger } from "./utils/logger.ts";
import { fetchTenantsWithLocales, isDefaultLocaleRecord } from "./utils/tenants.ts";
import { MigrationConfig, PutRecordCommand } from "./core/types.ts";
import { OsMigrationConfiguration } from "./config/types.ts";
import { ModelProvider } from "./models/model-provider.ts";
import { MigrationRunner } from "./core/runner.ts";
import { loadPreset } from "./core/preset-loader.ts";
import { decompressOsRecord } from "./opensearch/decompress-record.ts";
import { executeOsCommands, type OsCommandItem } from "./opensearch/executor.ts";
import { createOpenSearchClient, type Client } from "./opensearch/client.ts";

// ============================================================================
// Process OS Segment Command
// ============================================================================

export interface ProcessOsSegmentOptions {
  runId: string;
  segment: number;
  total: number;
  config: OsMigrationConfiguration;
}

export async function processOsSegment(options: ProcessOsSegmentOptions): Promise<void> {
  const logger = createLogger({
    msgPrefix: `[os-segment #${options.segment}] `
  });

  logger.info(
    `Starting OS segment ${options.segment} of ${options.total} (${Math.round(
      (options.segment / options.total) * 100
    )}%)`
  );

  // Source DB client — reads primary table (models, tenants) and OS table (scan)
  const sourceDatabase = new DynamoDBClient({
    region: options.config.source.region,
    credentials: options.config.source.credentials
  });

  // Target DB client — writes to target OS DynamoDB table
  const targetDatabase = new DynamoDBClient({
    region: options.config.target.region,
    credentials: options.config.target.credentials
  });

  // OS client — for index creation. Created once per segment.
  const osClient = options.config.target.credentials
    ? createOpenSearchClient({
        endpoint: options.config.target.opensearch.endpoint,
        region: options.config.target.region,
        service: options.config.target.opensearch.service,
        credentials: options.config.target.credentials
      })
    : undefined;

  // Cache of known indexes — persists across batches within this segment
  const knownIndexes = new Set<string>();

  // Fetch tenants and default locales from source primary table
  logger.info("Fetching tenants and default locales...");
  const tenantLocales = await fetchTenantsWithLocales(
    sourceDatabase,
    options.config.source.dynamodb.tableName
  );
  logger.info(`Found ${tenantLocales.size} tenants`);

  // Preload models from source primary table
  logger.info("Preloading models...");
  const modelProvider = new ModelProvider(
    sourceDatabase,
    options.config.source.dynamodb.tableName,
    options.config.migration.modelsDir
  );
  await modelProvider.preloadModels(tenantLocales);

  // Create migration config — targetPrimaryTable receives the auto-put records,
  // which the OS executor intercepts and rewrites as gzipped OS records.
  const migrationConfig: MigrationConfig = {
    sourcePrimaryTable: options.config.source.dynamodb.tableName,
    targetPrimaryTable: options.config.target.opensearch.tableName,
    sourceFmBucket: "",
    targetFmBucket: "",
    modelProvider
  };

  // Load and configure preset
  logger.info(`Loading preset: ${options.config.migration.preset}`);
  const preset = await loadPreset(options.config.migration.preset);
  logger.info(`Loaded preset: "${preset.name}" - ${preset.description}`);

  const runner = new MigrationRunner(migrationConfig, sourceDatabase);
  preset.configure(runner, migrationConfig, sourceDatabase);

  // Process records
  let processedCount = 0;
  let migratedCount = 0;
  let skippedCount = 0;
  const batchSize = 100;

  // Batch collects decompressed records + their metadata for the OS executor
  const batch: Array<{
    record: Record<string, unknown>;
    metadata: { index: string; _ct: string; _md: string };
    locale: string;
  }> = [];

  logger.info(`Scanning OS table: ${options.config.source.opensearch.tableName}...`);

  for await (const record of sourceDatabase.scan(options.config.source.opensearch.tableName, {
    segment: options.segment,
    totalSegments: options.total
  })) {
    processedCount++;

    // Decompress — returns null for non-CmsEntriesElasticsearch
    const decompressed = await decompressOsRecord(record);
    if (!decompressed) {
      skippedCount++;
      continue;
    }

    // Filter: only default locale records
    if (!isDefaultLocaleRecord(decompressed.record, tenantLocales)) {
      skippedCount++;
      continue;
    }

    // Extract locale before pipeline transforms the PK
    const locale = extractLocaleFromPk(decompressed.record.PK as string) || "en-US";

    batch.push({
      record: decompressed.record,
      metadata: decompressed.metadata,
      locale
    });

    // Process in batches
    if (batch.length >= batchSize) {
      await processOsBatch(batch, runner, targetDatabase, options.config.target.opensearch.tableName, osClient, knownIndexes);
      migratedCount += batch.length;
      batch.length = 0;

      if (processedCount % 1000 === 0) {
        logger.info(
          `Progress: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
        );
      }
    }
  }

  // Process remaining
  if (batch.length > 0) {
    await processOsBatch(batch, runner, targetDatabase, options.config.target.opensearch.tableName, osClient, knownIndexes);
    migratedCount += batch.length;
  }

  logger.info(
    `OS segment ${options.segment} completed: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Run a batch of decompressed records through the pipeline, then hand off
 * the transformed records to the OS executor for parallel gzip + write.
 */
async function processOsBatch(
  batch: Array<{ record: Record<string, unknown>; metadata: { index: string; _ct: string; _md: string }; locale: string }>,
  runner: MigrationRunner,
  targetDatabase: DynamoDBClient,
  targetTable: string,
  osClient?: Client,
  knownIndexes?: Set<string>
): Promise<void> {
  const osItems: OsCommandItem[] = [];

  for (const item of batch) {
    const commands = await runner.processRecord(item.record);

    for (const cmd of commands) {
      if (cmd.type === "PUT_RECORD") {
        osItems.push({
          record: (cmd as PutRecordCommand).record,
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
    knownIndexes
  });
}

function extractLocaleFromPk(pk: string): string | null {
  const match = pk.match(/#L#([^#]+)#/);
  return match ? match[1] : null;
}
