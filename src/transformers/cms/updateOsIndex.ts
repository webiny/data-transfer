import { createOsTransformer } from "~/transformers/createOsTransformer.ts";
import type { OsScanner } from "~/features/OsScanner/index.ts";

export const updateOsIndex = createOsTransformer("updateOsIndex", ctx => {
    const record = ctx.record as OsScanner.Record & Record<string, unknown>;

    const originalData = ctx.original.data as Record<string, unknown> | undefined;
    const recordData = record.data as Record<string, unknown> | undefined;

    if (!originalData || !recordData) {
        return;
    }

    const oldModelId = originalData.modelId as string | undefined;
    const newModelId = recordData.modelId as string | undefined;

    if (!oldModelId || !newModelId || oldModelId === newModelId) {
        return;
    }

    const currentIndex = record.index;
    if (!currentIndex) {
        return;
    }

    const oldSuffix = `-${oldModelId.toLowerCase()}`;
    const newSuffix = `-${newModelId.toLowerCase()}`;

    if (currentIndex.endsWith(oldSuffix)) {
        record.index = currentIndex.slice(0, -oldSuffix.length) + newSuffix;
    }
});
