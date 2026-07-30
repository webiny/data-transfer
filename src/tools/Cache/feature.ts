import { createFeature } from "~/base/index.js";
import { InMemoryCache } from "./InMemoryCache.ts";

export const CacheFeature = createFeature({
    name: "Core/CacheFeature",
    register(container) {
        container.register(InMemoryCache).inSingletonScope();
    }
});
