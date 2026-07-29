import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { OsRecordDecompressor as OsRecordDecompressorAbstraction } from "./abstractions/OsRecordDecompressor.js";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
class OsRecordDecompressorImpl {
  logger;
  compression;
  constructor(logger, compression) {
    this.logger = logger;
    this.compression = compression;
  }
  async decompress(osRecord) {
    if (!osRecord.index) {
      return null;
    }
    const data = osRecord.data;
    if (!data || "compression" in data === false) {
      return null;
    }
    const decompressed = await this.compression.decompress(data);
    if (!decompressed) {
      this.logger.warn(
        `Failed to decompress OS record PK=${osRecord.PK} SK=${osRecord.SK}. Data may be corrupt.`
      );
      return null;
    }
    return decompressed;
  }
}
export const OsRecordDecompressor = OsRecordDecompressorAbstraction.createImplementation({
  implementation: OsRecordDecompressorImpl,
  dependencies: [Logger, CompressionHandler]
});
//# sourceMappingURL=OsRecordDecompressor.js.map
