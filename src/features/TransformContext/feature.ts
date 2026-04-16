import { createFeature } from "~/base/index.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { DdbTransformContextFactory } from "./DdbTransformContextFactory.ts";
import { OsTransformContextFactory } from "./OsTransformContextFactory.ts";

export const TransformContextFeature = createFeature({
    name: "Core/TransformContextFeature",
    register(container) {
        const config = container.resolve(MigrationConfig);

        if (config.storage === "ddb") {
            container.register(DdbTransformContextFactory).inSingletonScope();
        } else {
            container.register(OsTransformContextFactory).inSingletonScope();
        }
    }
});
