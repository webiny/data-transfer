import { createConfigurations } from "@webiny/api-headless-cms-utils-os/configurations.js";
import { createOsTransformer } from "~/transformers/createOsTransformer.js";
import { CmsModelOpenSearchIndexProvider } from "@webiny/api-headless-cms-utils-os/exports/api/cms/opensearch.js";
import type { StorageCmsModel } from "@webiny/api-headless-cms/types/index.js";

export const updateOsIndex = createOsTransformer("updateOsIndex", async ctx => {
    const { record } = ctx;

    const modelId = record.data.modelId as string | undefined;
    const tenant = record.data.tenant as string | undefined;

    if (!modelId || !tenant) {
        ctx.logger.warn(
            `[updateOsIndex] Skipping index update — missing modelId or tenant. PK=${record.PK} SK=${record.SK}`
        );
        return;
    }

    const provider = ctx.container.resolve(CmsModelOpenSearchIndexProvider);

    const configurations = createConfigurations(provider);

    const result = await configurations.es({
        model: {
            modelId,
            tenant
        } as StorageCmsModel
    });

    record.index = result.index;
});
