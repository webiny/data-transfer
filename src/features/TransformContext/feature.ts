import { createFeature } from "~/base/index.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { BaseTransformContextFactory } from "./abstractions/BaseTransformContext.ts";
import { DdbTransformContextFactory as DdbTransformContextFactoryAbstraction } from "./abstractions/DdbTransformContext.ts";
import { OsTransformContextFactory as OsTransformContextFactoryAbstraction } from "./abstractions/OsTransformContext.ts";
import { DdbTransformContextFactory } from "./DdbTransformContextFactory.ts";
import { OsTransformContextFactory } from "./OsTransformContextFactory.ts";

export const TransformContextFeature = createFeature({
    name: "Core/TransformContextFeature",
    register(container) {
        const config = container.resolve(MigrationConfig);

        if (config.storage === "ddb") {
            container.register(DdbTransformContextFactory).inSingletonScope();
            container.registerFactory(BaseTransformContextFactory, () =>
                container.resolve(DdbTransformContextFactoryAbstraction)
            );
        } else {
            container.register(OsTransformContextFactory).inSingletonScope();
            container.registerFactory(BaseTransformContextFactory, () =>
                container.resolve(OsTransformContextFactoryAbstraction)
            );
        }
    }
});
