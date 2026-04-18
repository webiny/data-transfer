import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isCmsEntry, isFmFile } from "~/domain/transform/filters.ts";
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
import { createMetadata, extractImageMetadata } from "~/transformers/file-manager/index.ts";

/**
 * Pre-configured pipeline for File Manager files with all v5-to-v6 transformations.
 *
 * Mirrors the legacy `FmFilePipeline` which extended `CmsEntryPipeline`: the full
 * CMS entry chain runs first (FM files are stored as CMS entries), then the FM-specific
 * transformers append. Both `isCmsEntry` and `isFmFile` filters are ANDed together.
 */
export const fmFilePipeline = createDdbPipeline("fm-files", builder => {
    builder
        .filter([createFilter(isCmsEntry), createFilter(isFmFile)])
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeLocale)
        .use(fixCmePk)
        .use(fixBrokenStorageKeys)
        .use(transformRichText)
        .use(updateModelIds)
        .use(removeFolderRevision)
        .use(removeAttributes)
        .use(createMetadata)
        .use(extractImageMetadata);
});
