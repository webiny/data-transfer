import { SourceDynamoDbClient } from "../../../src/features/DynamoDbClient/abstractions/DynamoDbClient.ts";

/**
 * Mock implementation of IDynamoDbClient for testing.
 */
export class MockDynamoDbClient implements SourceDynamoDbClient.Interface {
    private records: Map<string, SourceDynamoDbClient.Record[]> = new Map();
    public batchPutRecords: SourceDynamoDbClient.Record[] = [];

    constructor(initialRecords: Record<string, SourceDynamoDbClient.Record[]> = {}) {
        for (const [table, records] of Object.entries(initialRecords)) {
            this.records.set(table, records);
        }
    }

    async *scan<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        options?: SourceDynamoDbClient.Scan
    ): AsyncIterable<T> {
        const records = this.records.get(tableName) || [];

        if (options && options.segment !== undefined && options.totalSegments) {
            for (let i = 0; i < records.length; i++) {
                if (i % options.totalSegments === options.segment) {
                    yield records[i] as T;
                }
            }
        } else {
            for (const record of records) {
                yield record as T;
            }
        }
    }

    async query<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        pk: string,
        sk?: string,
        _options?: SourceDynamoDbClient.Query
    ): Promise<T[]> {
        const records = this.records.get(tableName) || [];

        return records.filter(record => {
            if (record.PK !== pk) {
                return false;
            }
            if (sk && record.SK !== sk) {
                return false;
            }
            return true;
        }) as T[];
    }

    async batchPut<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        records: T[]
    ): Promise<void> {
        this.batchPutRecords.push(...records);

        const tableRecords = this.records.get(tableName) || [];
        tableRecords.push(...records);
        this.records.set(tableName, tableRecords);
    }

    // Test helpers
    getRecordsForTable(tableName: string): SourceDynamoDbClient.Record[] {
        return this.records.get(tableName) || [];
    }

    clearRecords(): void {
        this.batchPutRecords = [];
    }
}
