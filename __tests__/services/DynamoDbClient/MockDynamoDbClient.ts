import { SourceDynamoDbClient } from "../../../src/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { BaseRecord } from "../../../src/domain/transform/types/records.ts";

export interface MockUpdateCall {
    tableName: string;
    request: SourceDynamoDbClient.UpdateRequest;
    result: SourceDynamoDbClient.UpdateResult;
}

export class MockDynamoDbClient implements SourceDynamoDbClient.Interface {
    private records: Map<string, SourceDynamoDbClient.Record[]> = new Map();
    public batchPutRecords: SourceDynamoDbClient.Record[] = [];
    public updateCalls: MockUpdateCall[] = [];

    constructor(initialRecords: Record<string, SourceDynamoDbClient.Record[]> = {}) {
        for (const [table, records] of Object.entries(initialRecords)) {
            this.records.set(table, records);
        }
    }

    async *scan<T extends SourceDynamoDbClient.Record = BaseRecord>(
        tableName: string,
        options?: SourceDynamoDbClient.Scan
    ): AsyncIterable<T> {
        const records = this.records.get(tableName) || [];
        let yielded = 0;

        for (let i = 0; i < records.length; i++) {
            const record = records[i]!;
            if (options && options.segment !== undefined && options.totalSegments) {
                if (i % options.totalSegments !== options.segment) {
                    continue;
                }
            }
            if (
                options &&
                options.sortKeyEquals !== undefined &&
                record.SK !== options.sortKeyEquals
            ) {
                continue;
            }
            yield record as T;
            yielded++;
            if (options && options.limit !== undefined && yielded >= options.limit) {
                return;
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

    async get<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        pk: string,
        sk: string
    ): Promise<T | null> {
        const records = this.records.get(tableName) || [];
        const found = records.find(r => r.PK === pk && r.SK === sk);
        return (found as T) ?? null;
    }

    async queryAll<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        pk: string,
        sk?: string,
        options?: SourceDynamoDbClient.Query
    ): Promise<T[]> {
        return this.query<T>(tableName, pk, sk, options);
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

    async updateAttribute(
        tableName: string,
        request: SourceDynamoDbClient.UpdateRequest
    ): Promise<SourceDynamoDbClient.UpdateResult> {
        const records = this.records.get(tableName) || [];
        const record = records.find(r => r.PK === request.key.PK && r.SK === request.key.SK);
        const current = record ? record[request.condition.attribute] : undefined;
        const holds = JSON.stringify(current) === JSON.stringify(request.condition.equals);
        const result: SourceDynamoDbClient.UpdateResult =
            record && holds ? "written" : "condition-failed";

        if (record && holds) {
            let cursor = record as Record<string, unknown>;
            for (let i = 0; i < request.path.length - 1; i++) {
                const segment = request.path[i]!;
                const next = cursor[segment];
                if (typeof next !== "object" || next === null) {
                    cursor[segment] = {};
                }
                cursor = cursor[segment] as Record<string, unknown>;
            }
            cursor[request.path[request.path.length - 1]!] = request.value;
        }

        this.updateCalls.push({ tableName, request, result });
        return result;
    }

    // Test helpers
    getRecordsForTable(tableName: string): SourceDynamoDbClient.Record[] {
        return this.records.get(tableName) || [];
    }

    clearRecords(): void {
        this.batchPutRecords = [];
        this.updateCalls = [];
    }
}
