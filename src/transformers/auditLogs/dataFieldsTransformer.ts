import { createTransformer } from "~/transformers/createTransformer.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";

export const dataFieldsTransformer = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "auditLogs/dataFields",
    ctx => {
        const { record } = ctx;
        const values = record.values as Record<string, unknown> | undefined;
        const data = values?.["object@data"] as Record<string, unknown> | undefined;

        record.app = data?.["text@app"];
        record.action = data?.["text@action"];
        record.message = data?.["text@message"];
        record.entity = data?.["text@entity"];
        record.entityId = record.entryId;
        record.tags = (values?.["text@tags"] as string[] | undefined) ?? [];
        record.content = data?.["text@data"];
    }
);
