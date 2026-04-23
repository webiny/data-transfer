import { configurations } from "@webiny/api-headless-cms-ddb-es/configurations.js";
import { createOsTransformer } from "~/transformers/createOsTransformer.ts";

export const updateOsIndex = createOsTransformer("updateOsIndex", ctx => {
    const { record } = ctx;

    const modelId = record.data.modelId as string | undefined;
    const tenant = record.data.tenant as string | undefined;

    if (!modelId || !tenant) {
        console.warn(
            `[updateOsIndex] Skipping index update — missing modelId or tenant. PK=${record.PK} SK=${record.SK}`
        );
        return;
    }

    const { index } = configurations.es({ model: { modelId, tenant } });

    record.index = index;
});
