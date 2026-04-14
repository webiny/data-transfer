import { GzipCompression } from "../utils/gzip-compression.ts";
import { createLogger } from "../utils/logger.ts";

const gzip = new GzipCompression();
const logger = createLogger();

export interface OsRecordMetadata {
  index: string;
  _ct: string;
  _md: string;
}

export interface DecompressedOsRecord {
  record: Record<string, unknown>;
  metadata: OsRecordMetadata;
}

/**
 * Decompress a CmsEntriesElasticsearch OS DynamoDB record.
 * Returns the inner CMS entry with a derived TYPE field, plus outer metadata.
 * Returns null for non-CMS records, unexpected SK values, or if decompression fails.
 */
export async function decompressOsRecord(
  osRecord: Record<string, unknown>
): Promise<DecompressedOsRecord | null> {
  if (osRecord._et !== "CmsEntriesElasticsearch") {
    return null;
  }

  const data = osRecord.data as { compression?: string; value?: string } | undefined;
  if (!data || !gzip.canDecompress(data as any)) {
    return null;
  }

  const inner = await gzip.decompress(data as any);
  if (!inner) {
    logger.warn(
      `Failed to decompress OS record PK=${osRecord.PK} SK=${osRecord.SK}. Data may be corrupt.`
    );
    return null;
  }

  const sk = osRecord.SK as string;
  let type: string;
  if (sk === "L") {
    type = "cms.entry.l";
  } else if (sk === "P") {
    type = "cms.entry.p";
  } else {
    logger.warn(`Unexpected SK value "${sk}" for OS record PK=${osRecord.PK}. Skipping.`);
    return null;
  }

  return {
    record: {
      ...inner,
      TYPE: type
    },
    metadata: {
      index: osRecord.index as string,
      _ct: osRecord._ct as string,
      _md: osRecord._md as string
    }
  };
}

/**
 * Remove the locale segment from an OpenSearch index name.
 * e.g., "root-headless-cms-en-us-category" + "en-US" → "root-headless-cms-category"
 */
export function stripLocaleFromIndex(index: string, locale: string): string {
  const localeLower = locale.toLowerCase().replace("_", "-");
  return index.replace(`-${localeLower}-`, "-");
}
