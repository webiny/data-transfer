import { Logger } from "~/tools/Logger/abstractions/Logger.js";
import { OsRecordDecompressor as OsRecordDecompressorAbstraction } from "./abstractions/OsRecordDecompressor.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

export type { IOsRecordDecompressor } from "./abstractions/OsRecordDecompressor.js";

class OsRecordDecompressorImpl implements OsRecordDecompressorAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly compression: CompressionHandler.Interface
    ) {}

    public async decompress(
        osRecord: OsRecordDecompressorAbstraction.Compressed
    ): Promise<OsRecordDecompressorAbstraction.Decompressed | null> {
        if (!osRecord.index) {
            return null;
        }

        const data = osRecord.data;
        if (!data || "compression" in data === false) {
            return null;
        }

        const decompressed =
            await this.compression.decompress<OsRecordDecompressorAbstraction.Decompressed>(data);

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
