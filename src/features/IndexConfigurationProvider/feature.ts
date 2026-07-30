import { createFeature } from "~/base/index.js";
import { IndexConfigurationProvider } from "./IndexConfigurationProvider.ts";
import { IndexConfigurationResolver } from "./IndexConfigurationResolver.ts";

export const IndexConfigurationProviderFeature = createFeature({
    name: "Core/IndexConfigurationProviderFeature",
    register(container) {
        container.register(IndexConfigurationProvider).inSingletonScope();
        container.register(IndexConfigurationResolver).inSingletonScope();
    }
});
