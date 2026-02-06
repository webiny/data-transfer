import { RecordFilter } from "../core/pipeline.ts";
import { minimatch } from "minimatch";

// ============================================================================
// Filter Helpers
// ============================================================================

/**
 * Matches record TYPE using exact match or glob pattern.
 *
 * Examples:
 *   isType("cms.entry.l")     - exact match
 *   isType("cms.entry*")      - matches cms.entry, cms.entry.l, cms.entry.p, etc.
 *   isType("security.*")      - matches security.group, security.team, etc.
 */
export const isType = (pattern: string): RecordFilter => {
  // Check if pattern contains wildcards
  const hasWildcard = pattern.includes("*") || pattern.includes("?");

  if (hasWildcard) {
    // Use minimatch for glob patterns
    return record => {
      const type = record.TYPE;
      return typeof type === "string" && minimatch(type, pattern);
    };
  } else {
    // Exact match (fast path)
    return record => record.TYPE === pattern;
  }
};

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
