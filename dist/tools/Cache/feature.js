import { createFeature } from "../../base/index.js";
import { InMemoryCache } from "./InMemoryCache.js";
export const CacheFeature = createFeature({
  name: "Core/CacheFeature",
  register(container) {
    container.register(InMemoryCache).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
