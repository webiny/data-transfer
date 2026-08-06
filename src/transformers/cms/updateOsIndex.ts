import { configurations } from "@webiny/api-headless-cms-utils-os/configurations.js";
import { createOsTransformer } from "~/transformers/createOsTransformer.js";

export const updateOsIndex = createOsTransformer("updateOsIndex", ctx => {
    const { record } = ctx;

    const modelId = record.data.modelId as string | undefined;
    const tenant = record.data.tenant as string | undefined;

    if (!modelId || !tenant) {
        ctx.logger.warn(
            `[updateOsIndex] Skipping index update — missing modelId or tenant. PK=${record.PK} SK=${record.SK}`
        );
        return;
    }

    const { index } = configurations.es({
        model: {
            modelId,
            tenant
        }
    });

    record.index = index;
});
