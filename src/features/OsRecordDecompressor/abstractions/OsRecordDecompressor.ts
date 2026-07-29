import { createAbstraction } from "~/base/index.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";

interface OsCompressedRecordData {
    compression: string;
    value: string;
}

interface OsCompressedRecord extends BaseRecord {
    index: string;
    data: OsCompressedRecordData;
}

interface IOsRecordDecompressor {
    decompress(osRecord: OsCompressedRecord): Promise<Record<string, unknown> | null>;
}

export const OsRecordDecompressor = createAbstraction<IOsRecordDecompressor>(
    "Core/OsRecordDecompressor"
);

export namespace OsRecordDecompressor {
    export type Interface = IOsRecordDecompressor;
    export type Compressed = OsCompressedRecord;
    export type Decompressed = Record<string, unknown>;
}
