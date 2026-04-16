// ============================================================================
// Database Abstraction
// ============================================================================

export interface DatabaseRecord {
    PK: string;
    SK: string;
    [key: string]: any;
}

export interface ScanOptions {
    segment?: number;
    totalSegments?: number;
}

export interface QueryOptions {
    indexName?: string;
    limit?: number;
    sortKeyCondition?: {
        operator: "beginsWith" | "equals";
        value: string;
    };
}

export interface DatabaseClient {
    /** Scan entire table (or segment for parallel processing) */
    scan(tableName: string, options?: ScanOptions): AsyncIterable<DatabaseRecord>;

    /** Query by key */
    query(
        tableName: string,
        pk: string,
        sk?: string,
        options?: QueryOptions
    ): Promise<DatabaseRecord[]>;

    /** Put single record */
    put(tableName: string, record: DatabaseRecord): Promise<void>;

    /** Batch put records (handles batching internally) */
    batchPut(tableName: string, records: DatabaseRecord[]): Promise<void>;
}
