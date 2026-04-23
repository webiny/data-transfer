import { createTransformer } from "~/transformers/createTransformer.ts";

export const addTransferTimestamp = createTransformer("addTransferTimestamp", ctx => {
    (ctx.record as Record<string, unknown>)._tt = Date.now();
});
