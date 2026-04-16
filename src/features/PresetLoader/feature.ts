import { createFeature } from "@/src/base/index.ts";
import { PresetLoaderImpl } from "./PresetLoader.ts";
import { PresetLoader } from "./abstractions/PresetLoader.ts";
import { Logger } from "../Logger/abstractions/Logger.ts";

export const PresetLoaderFeature = createFeature({
    name: "Core/PresetLoaderFeature",
    register(container) {
        const logger = container.resolve(Logger);
        const loader = new PresetLoaderImpl(logger);
        container.registerInstance(PresetLoader, loader);
    }
});
