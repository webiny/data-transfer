import type { BaseRecord } from "~/domain/transform/types/records.ts";

export interface OsRecord extends BaseRecord {
    index: string;
    locale: string;
}

export interface OsShard {
    segment: number;
    total: number;
}
