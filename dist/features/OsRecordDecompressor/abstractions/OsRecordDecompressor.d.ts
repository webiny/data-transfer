import type { BaseRecord } from "../../../domain/transform/types/records.js";
interface OsCompressedRecordData {
  compression: string;
  value: string;
}
interface OsCompressedRecord extends BaseRecord {
  index: string;
  data: OsCompressedRecordData;
}
export interface IOsRecordDecompressor {
  decompress(osRecord: OsCompressedRecord): Promise<Record<string, unknown> | null>;
}
export declare const OsRecordDecompressor: import("@webiny/di").Abstraction<IOsRecordDecompressor>;
export declare namespace OsRecordDecompressor {
  type Interface = IOsRecordDecompressor;
  type Compressed = OsCompressedRecord;
  type Decompressed = Record<string, unknown>;
}
export {};
//# sourceMappingURL=OsRecordDecompressor.d.ts.map
