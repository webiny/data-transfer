import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { byType } from "~/domain/transform/filters.ts";
import { removeAttributes, wrapInData } from "~/transformers/global/index.ts";
import { migrateFileManagerSettings } from "~/transformers/file-manager/index.ts";

export const fmSettingsPipeline = createDdbPipeline("fm-settings", builder => {
    builder
        .filter(createFilter(byType("fm.settings")))
        .use(wrapInData)
        .use(migrateFileManagerSettings)
        .use(removeAttributes);
});
