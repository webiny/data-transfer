import type { BaseRecord } from "~/domain/transform/types/records.ts";

export interface OsRecord extends BaseRecord {
    index: string;
    data: Record<string, unknown>; // decompressed data
}

export interface OsShard {
    segment: number;
    total: number;
}
