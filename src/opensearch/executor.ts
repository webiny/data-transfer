import { GzipCompression } from "../utils/gzip-compression.ts";
import { stripLocaleFromIndex } from "./decompress-record.ts";
import { DatabaseClient } from "../database/interface.ts";
import type { OsRecordMetadata } from "./decompress-record.ts";
import type { Client } from "./client.ts";
import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration";
import { createLogger } from "../utils/logger.ts";

const gzip = new GzipCompression();
const logger = createLogger();

const RETRY_SCHEDULE = [5000, 10000, 20000, 30000, 30000];

// ============================================================================
// Types
// ============================================================================

export interface OsCommandItem {
  /** The transformed record from the pipeline (has PK, SK, TYPE, GSI_TENANT, data envelope) */
  record: Record<string, unknown>;
  /** Outer metadata from the source OS DynamoDB record */
  metadata: OsRecordMetadata;
  /** Locale extracted from the original PK (for index stripping) */
  locale: string;
}

export interface OsExecutorDependencies {
  database: DatabaseClient;
  targetTable: string;
  /** OpenSearch client for index creation. If not provided, index creation is skipped. */
  osClient?: Client;
  /** Cache of known index names. Persists across batches within a segment. */
  knownIndexes?: Set<string>;
  /** Custom retry schedule in ms. Defaults to [5000, 10000, 20000, 30000, 30000]. */
  retrySchedule?: number[];
}

// ============================================================================
// OS Command Executor
// ============================================================================

/**
 * Ensure indexes exist, gzip all records' data envelopes in parallel,
 * build OS DynamoDB shapes, and batch-write to the target OS table.
 */
export async function executeOsCommands(
  items: OsCommandItem[],
  deps: OsExecutorDependencies
): Promise<void> {
  if (items.length === 0) return;

  // Build the OS records (gzip in parallel, strip locale from index)
  const osRecords = await Promise.all(
    items.map(async ({ record, metadata, locale }) => {
      const compressed = await gzip.compress(record.data);
      const index = stripLocaleFromIndex(metadata.index, locale);

      return {
        PK: record.PK,
        SK: record.SK,
        data: compressed,
        index,
        TYPE: record.TYPE,
        GSI_TENANT: record.GSI_TENANT,
        _et: "CmsEntriesElasticsearch",
        _ct: metadata._ct,
        _md: metadata._md
      };
    })
  );

  // Ensure all target indexes exist (sequential)
  if (deps.osClient && deps.knownIndexes) {
    const uniqueIndexes = new Set(osRecords.map(r => r.index as string));
    const schedule = deps.retrySchedule || RETRY_SCHEDULE;
    for (const indexName of uniqueIndexes) {
      await ensureIndex(indexName, deps.osClient, deps.knownIndexes, schedule);
    }
  }

  await deps.database.batchPut(deps.targetTable, osRecords);
}

// ============================================================================
// Index Management
// ============================================================================

async function ensureIndex(
  indexName: string,
  client: Client,
  knownIndexes: Set<string>,
  schedule: number[]
): Promise<void> {
  if (knownIndexes.has(indexName)) return;

  try {
    await withRetry(async () => {
      const { body: exists } = await client.indices.exists({ index: indexName });
      if (exists) {
        knownIndexes.add(indexName);
        return;
      }

      try {
        const baseConfig = getBaseConfiguration();
        await client.indices.create({
          index: indexName,
          body: {
            ...baseConfig,
            settings: {
              ...baseConfig.settings,
              index: {
                ...baseConfig.settings?.index,
                refresh_interval: "-1"
              }
            }
          }
        });
        logger.info(`Created index: ${indexName}`);
      } catch (createError: any) {
        if (isAlreadyExistsError(createError)) {
          logger.info(`Index already exists (race condition): ${indexName}`);
        } else {
          throw createError;
        }
      }

      knownIndexes.add(indexName);
    }, `ensureIndex("${indexName}")`, schedule);
  } catch (error) {
    logger.error(
      { error },
      `Failed to ensure index "${indexName}" after retries. Continuing without index creation.`
    );
  }
}

// ============================================================================
// Retry Helper
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  schedule: number[] = RETRY_SCHEDULE
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= schedule.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < schedule.length) {
        const wait = schedule[attempt];
        logger.warn(
          `${label} failed (attempt ${attempt + 1}/${schedule.length + 1}). Retrying in ${wait / 1000}s...`
        );
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
  }

  throw lastError;
}

// ============================================================================
// Error Detection
// ============================================================================

function isAlreadyExistsError(error: any): boolean {
  const errorType = error?.meta?.body?.error?.type;
  if (errorType === "resource_already_exists_exception") return true;

  const message = error?.message || "";
  return message.includes("resource_already_exists_exception");
}
