import { createFeature } from "@/src/base/index.ts";
import { GzipCompression } from "./GzipCompression.ts";

export const GzipCompressionFeature = createFeature({
    name: "Core/GzipCompressionFeature",
    register(container) {
        container.register(GzipCompression).inSingletonScope();
    }
});
