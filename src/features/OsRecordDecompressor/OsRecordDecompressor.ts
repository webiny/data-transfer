import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { GzipCompression } from "~/tools/GzipCompression/abstractions/GzipCompression.ts";
import { OsRecordDecompressor as OsRecordDecompressorAbstraction } from "./abstractions/OsRecordDecompressor.ts";

class OsRecordDecompressorImpl implements OsRecordDecompressorAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly gzip: GzipCompression.Interface
    ) {}

    public async decompress(
        osRecord: OsRecordDecompressorAbstraction.Compressed
    ): Promise<OsRecordDecompressorAbstraction.Decompressed | null> {
        /**
         * Not possible to have an OS record without an index defined on it.
         */
        if (!osRecord.index) {
            return null;
        }

        const data = osRecord.data as GzipCompression.Compressed | undefined;
        if (!data || !this.gzip.canDecompress(data)) {
            return null;
        }

        const inner =
            await this.gzip.decompress<OsRecordDecompressorAbstraction.Decompressed>(data);
        if (!inner) {
            this.logger.warn(
                `Failed to decompress OS record PK=${osRecord.PK} SK=${osRecord.SK}. Data may be corrupt.`
            );
            return null;
        }

        return inner;
    }
}

export const OsRecordDecompressor = OsRecordDecompressorAbstraction.createImplementation({
    implementation: OsRecordDecompressorImpl,
    dependencies: [Logger, GzipCompression]
});
