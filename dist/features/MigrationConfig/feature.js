import { createFeature } from "../../base/index.js";
import { MigrationConfig } from "./abstractions/MigrationConfig.js";
export const MigrationConfigFeature = createFeature({
  name: "Core/MigrationConfigFeature",
  register(container, params) {
    container.registerInstance(MigrationConfig, params.config);
  }
});
//# sourceMappingURL=feature.js.map
