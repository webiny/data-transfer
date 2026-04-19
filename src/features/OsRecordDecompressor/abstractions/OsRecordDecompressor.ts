import { createAbstraction } from "~/base/index.ts";
import type { BaseRecord } from "~/domain/transform/index.js";

interface OsRecordMetadata {
    index: string;
    _ct: string;
    _md: string;
}

interface IOsRecordDecompressor {
    /**
     * Decompress a CmsEntriesElasticsearch OS DynamoDB record.
     * Returns the inner CMS entry (with PK/SK/TYPE from the outer record),
     * plus outer metadata and the locale extracted from the PK.
     * Returns null for non-CMS records, unexpected SK values, missing locale,
     * or failed decompression.
     */
    decompress(osRecord: Record<string, unknown>): Promise<BaseRecord | null>;
}

export const OsRecordDecompressor = createAbstraction<IOsRecordDecompressor>(
    "Core/OsRecordDecompressor"
);

export namespace OsRecordDecompressor {
    export type Interface = IOsRecordDecompressor;
    export type Decompressed = BaseRecord;
    export type Metadata = OsRecordMetadata;
}
