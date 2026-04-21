import { createFeature } from "~/base/index.ts";
import { ModelProvider } from "./ModelProvider.ts";

export const ModelProviderFeature = createFeature({
    name: "Core/ModelProviderFeature",
    register(container) {
        container.register(ModelProvider).inSingletonScope();
    }
});
