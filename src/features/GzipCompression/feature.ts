import { createFeature } from "@/src/base/index.ts";
import { GzipCompression } from "./abstractions/GzipCompression.ts";
import { GzipCompressionImpl } from "./GzipCompression.ts";

export const GzipCompressionFeature = createFeature({
  name: "Core/GzipCompressionFeature",
  register(container) {
    const compression = new GzipCompressionImpl();
    container.registerInstance(GzipCompression, compression);
  }
});
