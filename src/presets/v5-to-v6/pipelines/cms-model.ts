import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isCmsModel } from "~/domain/transform/filters.ts";
import {
    addGsiTenant,
    removeAttributes,
    removeLocale,
    wrapInData
} from "~/transformers/global/index.ts";
import { renameFieldAttributes, transformModelGroup } from "~/transformers/cms/index.ts";

/**
 * Pre-configured pipeline for CMS Models with all v5-to-v6 transformations.
 */
export const cmsModelPipeline = createDdbPipeline("cms-models", builder => {
    builder
        .filter(createFilter(isCmsModel))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeLocale)
        .use(transformModelGroup)
        .use(renameFieldAttributes)
        .use(removeAttributes);
});
