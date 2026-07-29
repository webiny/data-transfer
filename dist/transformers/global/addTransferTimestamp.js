import { createTransformer } from "../../transformers/createTransformer.js";
export const addTransferTimestamp = createTransformer("addTransferTimestamp", ctx => {
  ctx.record._tt = Date.now();
});
//# sourceMappingURL=addTransferTimestamp.js.map
