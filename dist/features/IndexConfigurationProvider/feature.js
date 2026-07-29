import { createFeature } from "../../base/index.js";
import { IndexConfigurationProvider } from "./IndexConfigurationProvider.js";
import { IndexConfigurationResolver } from "./IndexConfigurationResolver.js";
export const IndexConfigurationProviderFeature = createFeature({
  name: "Core/IndexConfigurationProviderFeature",
  register(container) {
    container.register(IndexConfigurationProvider).inSingletonScope();
    container.register(IndexConfigurationResolver).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
