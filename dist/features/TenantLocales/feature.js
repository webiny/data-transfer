import { createFeature } from "../../base/index.js";
import { TenantLocales } from "./TenantLocales.js";
export const TenantLocalesFeature = createFeature({
  name: "Core/TenantLocalesFeature",
  register(container) {
    container.register(TenantLocales).inSingletonScope();
  }
});
//# sourceMappingURL=feature.js.map
