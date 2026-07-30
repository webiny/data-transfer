import { createFeature } from "~/base/index.js";
import { OsRecordDecompressor } from "./OsRecordDecompressor.ts";

export const OsRecordDecompressorFeature = createFeature({
    name: "Core/OsRecordDecompressorFeature",
    register(container) {
        container.register(OsRecordDecompressor).inSingletonScope();
    }
});
