import { createFeature } from "~/base/index.ts";
import { PresetLoader } from "./PresetLoader.ts";

export const PresetLoaderFeature = createFeature({
    name: "Core/PresetLoaderFeature",
    register(container) {
        container.register(PresetLoader).inSingletonScope();
    }
});
