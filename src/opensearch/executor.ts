import { GzipCompression } from "../utils/gzip-compression.ts";
import { stripLocaleFromIndex } from "./decompress-record.ts";
import { DatabaseClient } from "../database/interface.ts";
import type { OsRecordMetadata } from "./decompress-record.ts";

const gzip = new GzipCompression();

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
}

// ============================================================================
// OS Command Executor
// ============================================================================

/**
 * Gzip all records' data envelopes in parallel, build OS DynamoDB shapes,
 * and batch-write to the target OS table.
 */
export async function executeOsCommands(
  items: OsCommandItem[],
  deps: OsExecutorDependencies
): Promise<void> {
  if (items.length === 0) return;

  // Gzip all records in parallel
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

  await deps.database.batchPut(deps.targetTable, osRecords);
}
