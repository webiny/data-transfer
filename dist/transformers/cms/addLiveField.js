import { createTransformer } from "../../transformers/createTransformer.js";
const NO_PUBLISHED_REVISION = -1;
const INTERNAL_MODELS = new Set(["fmfile", "wbyfmfile"]);
export const addLiveField = createTransformer("addLiveField", async ctx => {
  const data = ctx.record.data;
  if (!data) {
    return;
  }
  const modelId = data.modelId;
  if (!modelId || INTERNAL_MODELS.has(modelId.toLowerCase())) {
    return;
  }
  const publishedVersion = await resolvePublishedVersion(ctx);
  if (!publishedVersion) {
    data.live = null;
    return;
  }
  data.live = {
    version: publishedVersion
  };
});
async function resolvePublishedVersion(ctx) {
  const cacheKey = `live:${ctx.original.PK}`;
  const cached = ctx.cache.get(cacheKey);
  if (cached) {
    return cached === NO_PUBLISHED_REVISION ? null : cached;
  }
  // This record IS the published revision — no query needed.
  // P record: always the published revision by definition.
  // L record with status "published": L and P point to the same revision.
  const data = ctx.record.data;
  const originalSK = ctx.original.SK;
  const isPublishedRevision =
    originalSK === "P" || (originalSK === "L" && data.status === "published");
  if (isPublishedRevision) {
    const version = data.version;
    ctx.cache.set(cacheKey, version);
    return version;
  }
  ctx.logger.debug(`Querying for published revision of ${ctx.original.PK}...`);
  const published = await ctx.querySourceRecord(ctx.original.PK, "P");
  const version = published ? published.version : NO_PUBLISHED_REVISION;
  ctx.cache.set(cacheKey, version);
  return version === NO_PUBLISHED_REVISION ? null : version;
}
//# sourceMappingURL=addLiveField.js.map
