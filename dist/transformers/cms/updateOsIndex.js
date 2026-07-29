import { configurations } from "@webiny/api-headless-cms-ddb-es/configurations.js";
import { createOsTransformer } from "../../transformers/createOsTransformer.js";
export const updateOsIndex = createOsTransformer("updateOsIndex", ctx => {
  const { record } = ctx;
  const modelId = record.data.modelId;
  const tenant = record.data.tenant;
  if (!modelId || !tenant) {
    ctx.logger.warn(
      `[updateOsIndex] Skipping index update — missing modelId or tenant. PK=${record.PK} SK=${record.SK}`
    );
    return;
  }
  const { index } = configurations.es({
    model: {
      modelId,
      tenant,
      group: "any",
      description: null,
      icon: null,
      name: modelId,
      layout: [],
      pluralApiName: modelId,
      singularApiName: modelId,
      fields: [],
      titleFieldId: "id"
    }
  });
  record.index = index;
});
//# sourceMappingURL=updateOsIndex.js.map
