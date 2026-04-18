import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isFlpRecord } from "~/domain/transform/filters.ts";
import {
    addGsiTenant,
    removeAttributes,
    removeLocale,
    wrapInData
} from "~/transformers/global/index.ts";
import { updateFlpIds } from "~/transformers/folders/index.ts";

export const folderPermissionsPipeline = createDdbPipeline("folder-permissions", builder => {
    builder
        .filter(createFilter(isFlpRecord))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeLocale)
        .use(removeAttributes)
        .use(updateFlpIds);
});
