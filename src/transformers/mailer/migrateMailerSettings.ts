import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

/**
 * Migrates Mailer settings from old format to KeyValue format.
 * NOTE: This transformer expects wrapInData to run FIRST, so values is in record.data.values.
 */
export const migrateMailerSettings = createTransformer<BaseTransformContext.Interface>(
    "migrateMailerSettings",
    ctx => {
        const { record, original } = ctx;

        // Only process mailer settings records (identified by SK: "L" and modelId: "mailerSettings")
        if (original.SK !== "L" || original.modelId !== "mailerSettings") {
            return;
        }

        // Extract data envelope (wrapInData already ran)
        const dataEnvelope = record.data as Record<string, unknown> | undefined;
        if (!dataEnvelope) {
            return; // No data envelope
        }

        const values = dataEnvelope.values as Record<string, unknown>;
        const tenant = dataEnvelope.tenant || "root";

        // Replace with new KeyValue format
        ctx.replace({
            PK: `KV#${tenant}:Mailer/Settings/Transport`,
            SK: "A",
            data: {
                key: "Mailer/Settings/Transport",
                scope: tenant,
                value: values
            },
            TYPE: "KeyValueStore",
            GSI_TENANT: tenant as string,
            _ct: new Date().toISOString(),
            _et: "KeyValueStore",
            _md: new Date().toISOString()
        });
    }
);
