import { createDdbTransformer } from "~/transformers/createDdbTransformer.ts";

// Emits a verbatim S3 copy for a file record — source key == target key.
// Handles both raw v5 records (values["text@key"]) and post-wrapInData
// records (data.values["text@key"]).
export const copyFileToTarget = createDdbTransformer("copyFileToTarget", ctx => {
    const record = ctx.record as Record<string, unknown>;
    const values =
        (record.values as Record<string, unknown> | undefined) ||
        ((record.data as Record<string, unknown> | undefined)?.values as
            | Record<string, unknown>
            | undefined);
    const key = values?.["text@key"] as string | undefined;
    if (key) {
        ctx.copyFile(key, key);
    }
});
