import { RecordFilter } from "../core/pipeline.ts";

// ============================================================================
// Filter Helpers
// ============================================================================

export const isType = (type: string): RecordFilter => record =>
  record.TYPE === type;

export const isModel = (modelId: string): RecordFilter => record =>
  record.modelId === modelId;

export const isTenant = (tenant: string): RecordFilter => record =>
  record.tenant === tenant;

export const hasPKPrefix = (prefix: string): RecordFilter => record =>
  typeof record.PK === "string" && record.PK.startsWith(prefix);

export const hasSKPrefix = (prefix: string): RecordFilter => record =>
  typeof record.SK === "string" && record.SK.startsWith(prefix);

export const and = <T>(
  ...filters: RecordFilter<T>[]
): RecordFilter<T> => record => filters.every(f => f(record));

export const or = <T>(
  ...filters: RecordFilter<T>[]
): RecordFilter<T> => record => filters.some(f => f(record));

export const not = <T>(filter: RecordFilter<T>): RecordFilter<T> => record =>
  !filter(record);
