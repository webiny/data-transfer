import { createFeature } from "~/base/index.ts";
import { OsRecordDecompressor } from "./OsRecordDecompressor.ts";

export const OsRecordDecompressorFeature = createFeature({
    name: "Core/OsRecordDecompressorFeature",
    register(container) {
        container.register(OsRecordDecompressor).inSingletonScope();
    }
});
