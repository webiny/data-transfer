import { DynamoDBClient } from "./database/dynamodb-client.ts";
import { S3Client } from "./storage/s3-client.ts";
import { executeCommands } from "./core/executor.ts";
import { Logger } from "./utils/logger.ts";
import {
  fetchTenantsWithLocales,
  isDefaultLocaleRecord
} from "./utils/tenants.ts";
import { bootstrapMigrationRunner } from "./utils/bootstrap-runner.ts";
import { MigrationConfig } from "./core/types.ts";

// ============================================================================
// Process Segment Command
// ============================================================================

export interface ProcessSegmentOptions {
  segment: number;
  total: number;
  sourcePrimaryTable: string;
  targetPrimaryTable: string;
  sourceFmBucket: string;
  targetFmBucket: string;
}

export async function processSegment(
  options: ProcessSegmentOptions
): Promise<void> {
  const logger = new Logger(`segment-${options.segment}`);

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
  const tenantLocales = await fetchTenantsWithLocales(
    database,
    options.sourcePrimaryTable
  );
  logger.info(`Found ${tenantLocales.size} tenants`);

  // Create migration config
  const config: MigrationConfig = {
    sourcePrimaryTable: options.sourcePrimaryTable,
    targetPrimaryTable: options.targetPrimaryTable,
    sourceFmBucket: options.sourceFmBucket,
    targetFmBucket: options.targetFmBucket
  };

  // Create and bootstrap migration runner
  const runner = bootstrapMigrationRunner(config, database);

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

  logger.success(
    `Segment ${
      options.segment
    } completed: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
  );
}
