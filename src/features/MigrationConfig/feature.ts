import { createFeature } from "@/src/base/index.ts";
import { MigrationConfig } from "./abstractions/MigrationConfig.ts";

interface MigrationConfigFeatureParams {
    config: MigrationConfig.Interface;
}

export const MigrationConfigFeature = createFeature<MigrationConfigFeatureParams>({
    name: "Core/MigrationConfigFeature",
    register(container, params) {
        container.registerInstance(MigrationConfig, params!.config);
    }
});
