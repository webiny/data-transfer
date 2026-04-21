import { createFeature } from "~/base/index.ts";
import { TenantLocales } from "./TenantLocales.ts";

export const TenantLocalesFeature = createFeature({
    name: "Core/TenantLocalesFeature",
    register(container) {
        container.register(TenantLocales).inSingletonScope();
    }
});
