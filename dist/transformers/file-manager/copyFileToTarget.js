import { createDdbTransformer } from "../../transformers/createDdbTransformer.js";
// Emits a verbatim S3 copy for a file record — source key == target key.
// Handles both raw v5 records (values["text@key"]) and post-wrapInData
// records (data.values["text@key"]).
export const copyFileToTarget = createDdbTransformer("copyFileToTarget", ctx => {
  const record = ctx.record;
  const values = record.values || record.data?.values;
  const key = values?.["text@key"];
  if (key) {
    ctx.copyFile(key, key);
  }
});
//# sourceMappingURL=copyFileToTarget.js.map
