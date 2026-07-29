import { createFeature } from "../../base/index.js";
import { ModelProvider } from "./ModelProvider.js";
export const ModelProviderFeature = createFeature({
  name: "Core/ModelProviderFeature",
  register(container) {
    container.register(ModelProvider).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
