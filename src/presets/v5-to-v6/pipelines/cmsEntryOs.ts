import { createFilter, createOsPipeline } from "~/domain/pipeline/index.ts";
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

export const cmsEntryOsPipeline = createOsPipeline("cms-entries-os", builder => {
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
