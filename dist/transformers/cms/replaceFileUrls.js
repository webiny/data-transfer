import { createTransformer } from "../../transformers/createTransformer.js";
import { visitFields } from "./fieldVisitor.js";
function replaceUrls(str, source, target) {
  return str.replaceAll(source, target);
}
function replaceRichTextUrls(rt, source, target) {
  if (typeof rt.state === "string") {
    rt.state = replaceUrls(rt.state, source, target);
  }
  if (typeof rt.html === "string") {
    rt.html = replaceUrls(rt.html, source, target);
  }
}
function isCompressedValue(value) {
  return "compression" in value && "value" in value;
}
function replaceFileField(params) {
  const { fieldValues, field, value, source, target } = params;
  if (Array.isArray(value)) {
    fieldValues[field.storageId] = value.map(v =>
      typeof v === "string" ? replaceUrls(v, source, target) : v
    );
  } else if (typeof value === "string") {
    fieldValues[field.storageId] = replaceUrls(value, source, target);
  }
}
async function replaceRichTextField(params) {
  const { fieldValues, field, value, source, target, compressionHandler } = params;
  if (!value || typeof value !== "object") {
    return;
  }
  if (isCompressedValue(value)) {
    const rt = await compressionHandler.decompress(value);
    replaceRichTextUrls(rt, source, target);
    fieldValues[field.storageId] = await compressionHandler.compress(rt);
  } else {
    // value is a reference already in fieldValues — mutation propagates without re-assignment
    replaceRichTextUrls(value, source, target);
  }
}
async function visitFieldUrls(params) {
  if (params.field.type === "file") {
    replaceFileField(params);
  } else if (params.field.type === "rich-text") {
    await replaceRichTextField(params);
  }
}
export function replaceFileUrls(config) {
  return createTransformer("replaceFileUrls", async ctx => {
    if (!config.fileUrls?.target || !config.fileUrls.source) {
      return;
    }
    const { source, target } = config.fileUrls;
    const data = ctx.record.data;
    if (!data) {
      return;
    }
    const modelId = data.modelId;
    if (!modelId) {
      return;
    }
    const model = ctx.modelProvider.getModel(modelId);
    if (!model) {
      return;
    }
    const values = data.values;
    if (!values || typeof values !== "object") {
      return;
    }
    const { compressionHandler } = ctx;
    await visitFields(values, model.fields, async (fieldValues, field, value) => {
      await visitFieldUrls({
        fieldValues,
        field,
        value,
        source,
        target,
        compressionHandler
      });
    });
  });
}
//# sourceMappingURL=replaceFileUrls.js.map
