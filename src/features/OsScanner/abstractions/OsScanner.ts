import type { BaseRecord } from "~/domain/transform/types/records.js";

export interface OsRecord extends BaseRecord {
    index: string;
    data: Record<string, unknown>; // decompressed data
}

export interface OsShard {
    segment: number;
    total: number;
}
