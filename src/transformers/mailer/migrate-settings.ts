import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Migrates Mailer settings from old format to KeyValue format
 */
export const migrateMailerSettings: Transformer = {
  name: "migrateMailerSettings",
  transform(ctx: TransformContext) {
    const { original } = ctx;

    // Only process mailer settings records (identified by SK: "L" and modelId: "mailerSettings")
    if (original.SK !== "L" || original.modelId !== "mailerSettings") {
      return;
    }

    const values = original.values as Record<string, unknown>;
    const tenant = original.tenant || "root";

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
};
