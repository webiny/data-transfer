import { createFeature } from "~/base/index.js";
import { DefaultCmsModelOpenSearchIndexProvider } from "@webiny/api-headless-cms-utils-os/features/CmsModelOpenSearchIndex/index.js";
import { CmsModelOpenSearchIndex } from "./CmsModelOpenSearchIndex.ts";

export const CmsModelOpenSearchIndexFeature = createFeature({
    name: "Core/CmsModelOpenSearchIndexFeature",
    register(container) {
        container.register(CmsModelOpenSearchIndex).inSingletonScope();
        container.register(DefaultCmsModelOpenSearchIndexProvider).inSingletonScope();
    }
});
