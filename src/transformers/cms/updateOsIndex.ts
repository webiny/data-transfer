import { createOsTransformer } from "~/transformers/createOsTransformer.ts";

export const updateOsIndex = createOsTransformer("updateOsIndex", ctx => {
    const { record, original } = ctx;

    const oldModelId = original.data.modelId as string | undefined;
    const newModelId = record.data.modelId as string | undefined;

    if (!oldModelId || !newModelId || oldModelId === newModelId) {
        return;
    }

    const oldSuffix = `-${oldModelId.toLowerCase()}`;
    const newSuffix = `-${newModelId.toLowerCase()}`;

    if (record.index.endsWith(oldSuffix)) {
        record.index = record.index.slice(0, -oldSuffix.length) + newSuffix;
    }
});
