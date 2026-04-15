import { createFeature } from "@/src/base/index.ts";
import { InMemoryCache } from "./InMemoryCache.ts";

export const CacheFeature = createFeature({
  name: "Core/CacheFeature",
  register(container) {
    container.register(InMemoryCache).inSingletonScope();
  }
});
