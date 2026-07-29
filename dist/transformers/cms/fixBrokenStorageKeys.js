import { createTransformer } from "../../transformers/createTransformer.js";
import { getCorrectStorageId } from "./fieldUtils.js";
import { visitFields } from "./fieldVisitor.js";
const INTERNAL_MODELS = new Set(["fmfile", "wbyfmfile"]);
const modelMissingWarnings = new Set();
export const fixBrokenStorageKeys = createTransformer("fixBrokenStorageKeys", async ctx => {
  const data = ctx.record.data;
  if (!data) {
    return;
  }
  const modelId = data.modelId;
  if (!modelId) {
    return;
  } else if (INTERNAL_MODELS.has(modelId.toLowerCase())) {
    // These models are not affected by the broken keys issue, so we can skip them entirely.
    return;
  }
  const model = ctx.modelProvider.getModel(modelId);
  if (!model) {
    if (modelMissingWarnings.has(modelId)) {
      return;
    }
    modelMissingWarnings.add(modelId);
    ctx.logger.warn(`[fixBrokenStorageKeys] Model ${modelId} not found, skipping`);
    return;
  }
  const values = data.values;
  if (!values || typeof values !== "object") {
    return;
  }
  await fixAllKeys(values, model.fields, ctx.logger);
});
async function fixAllKeys(values, modelFields, logger) {
  await visitFields(values, modelFields, (values, field, _value) => {
    const correctKey = getCorrectStorageId(field);
    const declaredKey = field.storageId;
    const fieldIdKey = field.fieldId;
    if (correctKey.startsWith("fragment-uuid")) {
      return;
    }
    const wrongKeys = new Set();
    if (declaredKey !== correctKey) {
      wrongKeys.add(declaredKey);
    }
    if (fieldIdKey !== correctKey) {
      wrongKeys.add(fieldIdKey);
    }
    let foundValue = values[correctKey];
    let wrongKeyUsed = null;
    if (foundValue === undefined) {
      for (const wrongKey of wrongKeys) {
        if (wrongKey in values) {
          foundValue = values[wrongKey];
          wrongKeyUsed = wrongKey;
          break;
        }
      }
    }
    if (!wrongKeyUsed) {
      return;
    }
    values[correctKey] = foundValue;
    delete values[wrongKeyUsed];
    logger.debug(`[fixBrokenStorageKeys] Fixed key: ${wrongKeyUsed} → ${correctKey}`);
  });
}
//# sourceMappingURL=fixBrokenStorageKeys.js.map
