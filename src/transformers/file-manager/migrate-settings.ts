import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Migrates File Manager settings from old format to KeyValue format.
 * NOTE: This transformer expects wrapInData to run FIRST, so the original data is in record.data.
 */
export const migrateFileManagerSettings: Transformer = {
    name: "migrateFileManagerSettings",
    transform(ctx: TransformContext) {
        const { record, original } = ctx;

        // Only process if this is a File Manager settings record
        if (original.TYPE !== "fm.settings") {
            return;
        }

        // Extract data envelope (wrapInData already ran)
        const dataEnvelope = record.data as Record<string, unknown> | undefined;
        if (!dataEnvelope) {
            return; // No data envelope
        }

        const tenant = dataEnvelope.tenant || "root";

        // Extract settings (everything except tenant)
        const { tenant: _tenant, ...settingsValue } = dataEnvelope;

        // Replace with new KeyValue format
        ctx.replace({
            PK: `KV#${tenant}:FileManager/General`,
            SK: "A",
            data: {
                key: "FileManager/General",
                scope: tenant,
                value: settingsValue
            },
            TYPE: "KeyValueStore",
            GSI_TENANT: tenant as string,
            _ct: new Date().toISOString(),
            _et: "KeyValueStore",
            _md: new Date().toISOString()
        });
    }
};
