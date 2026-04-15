import { createFeature } from "@/src/base/index.ts";
import { Cache } from "./abstractions/Cache.ts";
import { InMemoryCache } from "./InMemoryCache.ts";

export const CacheFeature = createFeature({
  name: "Core/CacheFeature",
  register(container) {
    const cache = new InMemoryCache();
    container.registerInstance(Cache, cache);
  }
});
