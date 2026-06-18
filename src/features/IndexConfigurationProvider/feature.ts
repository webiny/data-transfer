import { createFeature } from "~/base/index.ts";
import { IndexConfigurationProvider } from "./IndexConfigurationProvider.ts";

export const IndexConfigurationProviderFeature = createFeature({
    name: "Core/IndexConfigurationProviderFeature",
    register(container) {
        container.register(IndexConfigurationProvider).inSingletonScope();
    }
});
