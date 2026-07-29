import { createFeature } from "~/base/index.js";
import { TenantLocales } from "./TenantLocales.ts";

export const TenantLocalesFeature = createFeature({
    name: "Core/TenantLocalesFeature",
    register(container) {
        container.register(TenantLocales).inSingletonScope();
    }
});
