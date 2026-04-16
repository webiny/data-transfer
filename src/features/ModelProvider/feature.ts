import { createFeature } from "@/src/base/index.ts";
import { ModelProvider } from "./ModelProvider.ts";

export const ModelProviderFeature = createFeature({
    name: "Core/ModelProviderFeature",
    register(container) {
        container.register(ModelProvider).inSingletonScope();
    }
});
