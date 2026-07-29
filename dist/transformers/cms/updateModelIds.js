import { createTransformer } from "../../transformers/createTransformer.js";
const MODEL_ID_MAP = {
  fmFile: "wbyFmFile",
  acoFolder: "wbyAcoFolder",
  acoFilter: "wbyAcoFilter",
  webinyTask: "wbyTask",
  webinyTaskLog: "wbyTaskLog",
  wby_recordLocking: "wbyRecordLock"
};
/**
 * Updates modelIds in keys and data.modelId attribute.
 * NOTE: This transformer expects wrapInData to run FIRST, so modelId is in data.modelId.
 */
export const updateModelIds = createTransformer("updateModelIds", ctx => {
  const { record } = ctx;
  // Update modelId in keys (PK, SK, GSI keys)
  const keysToUpdate = ["PK", "SK", "GSI1_PK", "GSI1_SK", "GSI2_PK", "GSI2_SK"];
  for (const key of keysToUpdate) {
    if (typeof record[key] === "string") {
      record[key] = updateModelIdInString(record[key]);
    }
  }
  // Update modelId attribute in data envelope
  if (record.data && typeof record.data === "object") {
    const data = record.data;
    if (typeof data.modelId === "string" && MODEL_ID_MAP[data.modelId]) {
      data.modelId = MODEL_ID_MAP[data.modelId];
    }
  }
});
function updateModelIdInString(value) {
  let result = value;
  for (const [oldId, newId] of Object.entries(MODEL_ID_MAP)) {
    // Replace modelId in key patterns like #M#fmFile#
    result = result.replace(new RegExp(`#${oldId}#`, "g"), `#${newId}#`);
    result = result.replace(new RegExp(`#${oldId}$`), `#${newId}`);
  }
  return result;
}
//# sourceMappingURL=updateModelIds.js.map
