import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createFilter, createOsPipeline } from "~/domain/pipeline/index.ts";
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

// OS companion rows carry `_et === "CmsEntriesElasticsearch"` for CMS entries
// and `"PbPagesEs"` (etc.) for other record types. The scanner now passes all
// `.index`-bearing rows through; this filter scopes the pipeline to CMS entries.
const isCmsEntryOsRecord = (record: BaseRecord): boolean => {
    return record._et === "CmsEntriesElasticsearch";
};

export const cmsEntryOsPipeline = createOsPipeline("cms-entries-os", builder => {
    builder
        .filter(createFilter<BaseRecord>(isCmsEntryOsRecord))
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
