import { createFeature } from "../../base/index.js";
import { PresetLoader } from "./PresetLoader.js";
export const PresetLoaderFeature = createFeature({
  name: "Core/PresetLoaderFeature",
  register(container) {
    container.register(PresetLoader).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
