import {
  DatabaseClient,
  DatabaseRecord,
  ScanOptions,
  QueryOptions
} from "../../src/database/interface.ts";

/**
 * Mock DatabaseClient for testing
 */
export class MockDatabaseClient implements DatabaseClient {
  private records: Map<string, DatabaseRecord[]> = new Map();
  private queryResponses: Map<string, DatabaseRecord> = new Map();
  public putRecords: DatabaseRecord[] = [];
  public batchPutRecords: DatabaseRecord[] = [];

  constructor(initialRecords: Record<string, DatabaseRecord[]> = {}) {
    for (const [table, records] of Object.entries(initialRecords)) {
      this.records.set(table, records);
    }
  }

  /**
   * Mock a query response for testing
   */
  mockQueryResponse(pk: string, sk: string, record: DatabaseRecord): void {
    const key = `${pk}:${sk}`;
    this.queryResponses.set(key, record);
  }

  async *scan(tableName: string, options?: ScanOptions): AsyncIterable<DatabaseRecord> {
    const records = this.records.get(tableName) || [];

    // If segmented scan, filter by segment
    if (options && options.segment !== undefined && options.totalSegments) {
      const segmentRecords = records.filter((_, index) => {
        return index % options.totalSegments! === options.segment;
      });

      for (const record of segmentRecords) {
        yield record;
      }
    } else {
      for (const record of records) {
        yield record;
      }
    }
  }

  async query(
    tableName: string,
    pk: string,
    sk?: string,
    options?: QueryOptions
  ): Promise<DatabaseRecord[]> {
    // Check for mocked response first
    const key = `${pk}:${sk || ""}`;
    const mockedRecord = this.queryResponses.get(key);
    if (mockedRecord) {
      return [mockedRecord];
    }

    // Fall back to records
    const records = this.records.get(tableName) || [];

    return records.filter(record => {
      if (record.PK !== pk) return false;
      if (sk && record.SK !== sk) return false;
      return true;
    });
  }

  async put(tableName: string, record: DatabaseRecord): Promise<void> {
    this.putRecords.push(record);

    // Also add to records for querying
    const tableRecords = this.records.get(tableName) || [];
    tableRecords.push(record);
    this.records.set(tableName, tableRecords);
  }

  async batchPut(tableName: string, records: DatabaseRecord[]): Promise<void> {
    this.batchPutRecords.push(...records);

    // Also add to records for querying
    const tableRecords = this.records.get(tableName) || [];
    tableRecords.push(...records);
    this.records.set(tableName, tableRecords);
  }

  // Test helper methods
  getRecordsForTable(tableName: string): DatabaseRecord[] {
    return this.records.get(tableName) || [];
  }

  clearPutRecords(): void {
    this.putRecords = [];
    this.batchPutRecords = [];
  }
}
