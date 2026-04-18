import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isCmsEntry } from "~/domain/transform/filters.ts";
import {
    addGsiTenant,
    removeAttributes,
    removeLocale,
    wrapInData
} from "~/transformers/global/index.ts";
import {
    fixBrokenStorageKeys,
    fixCmePk,
    removeFolderRevision,
    transformRichText,
    updateModelIds
} from "~/transformers/cms/index.ts";

/**
 * Pre-configured pipeline for CMS Entries with all v5-to-v6 transformations.
 */
export const cmsEntryPipeline = createDdbPipeline("cms-entries", builder => {
    builder
        .filter(createFilter(isCmsEntry))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeLocale)
        .use(fixCmePk)
        .use(fixBrokenStorageKeys)
        .use(transformRichText)
        .use(updateModelIds)
        .use(removeFolderRevision)
        .use(removeAttributes);
});
