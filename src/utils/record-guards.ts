/**
 * Validated record shape for OS executor input.
 * Records coming out of the pipeline should have these fields
 * after transformers (wrapInData, addGsiTenant, etc.) have run.
 */
export interface TransformedRecord {
  PK: string;
  SK: string;
  TYPE: string;
  GSI_TENANT: string;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Type guard that validates a record has the required fields
 * with correct types after pipeline transformation.
 */
export function isTransformedRecord(record: Record<string, unknown>): record is TransformedRecord {
  return (
    typeof record.PK === "string" &&
    typeof record.SK === "string" &&
    typeof record.TYPE === "string" &&
    typeof record.GSI_TENANT === "string" &&
    record.data !== null &&
    record.data !== undefined &&
    typeof record.data === "object"
  );
}
