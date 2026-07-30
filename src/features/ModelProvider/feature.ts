import { createFeature } from "~/base/index.js";
import { ModelProvider } from "./ModelProvider.ts";

export const ModelProviderFeature = createFeature({
    name: "Core/ModelProviderFeature",
    register(container) {
        container.register(ModelProvider).inSingletonScope();
    }
});
