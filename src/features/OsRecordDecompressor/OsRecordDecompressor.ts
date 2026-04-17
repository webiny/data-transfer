import { Logger } from "~/features/Logger/abstractions/Logger.ts";
import { GzipCompression } from "~/features/GzipCompression/abstractions/GzipCompression.ts";
import { OsRecordDecompressor as OsRecordDecompressorAbstraction } from "./abstractions/OsRecordDecompressor.ts";

const DEFAULT_LOCALE = "en-US";

class OsRecordDecompressorImpl implements OsRecordDecompressorAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly gzip: GzipCompression.Interface
    ) {}

    public async decompress(
        osRecord: Record<string, unknown>
    ): Promise<OsRecordDecompressorAbstraction.Decompressed | null> {
        if (osRecord._et !== "CmsEntriesElasticsearch") {
            return null;
        }

        const data = osRecord.data as GzipCompression.Compressed | undefined;
        if (!data || !this.gzip.canDecompress(data)) {
            return null;
        }

        const inner = await this.gzip.decompress<Record<string, unknown>>(data);
        if (!inner) {
            this.logger.warn(
                `Failed to decompress OS record PK=${osRecord.PK} SK=${osRecord.SK}. Data may be corrupt.`
            );
            return null;
        }

        const sk = osRecord.SK as string;
        let type: string;
        if (sk === "L") {
            type = "cms.entry.l";
        } else if (sk === "P") {
            type = "cms.entry.p";
        } else {
            this.logger.warn(
                `Unexpected SK value "${sk}" for OS record PK=${osRecord.PK}. Skipping.`
            );
            return null;
        }

        const pk = osRecord.PK as string;
        const locale = this.extractLocaleFromPk(pk) ?? DEFAULT_LOCALE;

        return {
            record: {
                ...inner,
                PK: pk,
                SK: sk,
                TYPE: type
            },
            metadata: {
                index: osRecord.index as string,
                _ct: osRecord._ct as string,
                _md: osRecord._md as string
            },
            locale
        };
    }

    private extractLocaleFromPk(pk: string): string | null {
        const match = pk.match(/#L#([^#]+)#/);
        return match ? match[1] : null;
    }
}

export const OsRecordDecompressor = OsRecordDecompressorAbstraction.createImplementation({
    implementation: OsRecordDecompressorImpl,
    dependencies: [Logger, GzipCompression]
});
