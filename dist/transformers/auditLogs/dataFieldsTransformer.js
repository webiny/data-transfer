import { createTransformer } from "../../transformers/createTransformer.js";
export const dataFieldsTransformer = createTransformer("auditLogs/dataFields", ctx => {
  const { record } = ctx;
  const values = record.values;
  const data = values?.["object@data"];
  record.app = data?.["text@app"];
  record.action = data?.["text@action"];
  record.message = data?.["text@message"];
  record.entity = data?.["text@entity"];
  record.entityId = record.entryId;
  record.tags = values?.["text@tags"] ?? [];
  record.content = data?.["text@data"];
});
//# sourceMappingURL=dataFieldsTransformer.js.map
