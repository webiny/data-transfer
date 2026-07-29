import { createTransformer } from "../../transformers/createTransformer.js";
import { LexicalRenderer } from "./lexicalRenderer.js";
import { visitFields } from "./fieldVisitor.js";
import { generateInitialLexicalValue } from "@webiny/lexical-nodes/generateInitialLexicalValue.js";
const lexicalRenderer = new LexicalRenderer();
export const transformRichText = createTransformer("transformRichText", async ctx => {
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
  await visitFields(values, model.fields, async (values, field, value) => {
    if (field.type !== "rich-text") {
      return;
    }
    await transformRichTextField({
      original: ctx.original,
      compressionHandler: ctx.compressionHandler,
      logger: ctx.logger,
      values,
      storageId: field.storageId,
      value
    });
  });
});
async function transformRichTextField(params) {
  const { original, compressionHandler, logger, values, storageId, value } = params;
  if (!value || typeof value !== "object" || !("compression" in value) || !("value" in value)) {
    return;
  }
  const decompressed = await compressionHandler.decompress(value);
  try {
    if (!decompressed || typeof decompressed !== "object" || !("root" in decompressed)) {
      return;
    }
    let lexicalState = decompressed;
    if (!lexicalState.root.children?.length) {
      lexicalState = JSON.parse(generateInitialLexicalValue());
    }
    const newFormat = {
      state: JSON.stringify(lexicalState),
      html: lexicalRenderer.render(lexicalState)
    };
    values[storageId] = await compressionHandler.compress(newFormat);
  } catch (error) {
    logger.warn(
      `[transformRichText][${original.PK} / ${original.SK}] Failed to transform ${storageId}: ${error.message}`
    );
  }
}
//# sourceMappingURL=transformRichText.js.map
