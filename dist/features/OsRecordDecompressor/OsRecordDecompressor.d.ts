import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { OsRecordDecompressor as OsRecordDecompressorAbstraction } from "./abstractions/OsRecordDecompressor.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
export type { IOsRecordDecompressor } from "./abstractions/OsRecordDecompressor.js";
declare class OsRecordDecompressorImpl implements OsRecordDecompressorAbstraction.Interface {
  private readonly logger;
  private readonly compression;
  constructor(logger: Logger.Interface, compression: CompressionHandler.Interface);
  decompress(
    osRecord: OsRecordDecompressorAbstraction.Compressed
  ): Promise<OsRecordDecompressorAbstraction.Decompressed | null>;
}
export declare const OsRecordDecompressor: typeof OsRecordDecompressorImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/OsRecordDecompressor.ts").IOsRecordDecompressor
  >;
};
//# sourceMappingURL=OsRecordDecompressor.d.ts.map
