import { createTransformer } from "~/transformers/createTransformer.js";
import type { DdbCoreTransformContext } from "~/features/TransformContext/abstractions/contextAliases.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";

const NO_PUBLISHED_REVISION = -1;

const INTERNAL_MODELS = new Set(["fmfile", "wbyfmfile"]);

export const addLiveField = createTransformer<DdbCoreTransformContext.Interface<BaseRecord>>(
    "addLiveField",
    async ctx => {
        const data = ctx.record.data as Record<string, unknown> | undefined;
        if (!data) {
            return;
        }

        const modelId = data.modelId as string | undefined;
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
    }
);

async function resolvePublishedVersion(
    ctx: DdbCoreTransformContext.Interface<BaseRecord>
): Promise<number | null> {
    const cacheKey = `live:${ctx.original.PK}`;

    const cached = ctx.cache.get<number>(cacheKey);
    if (cached) {
        return cached === NO_PUBLISHED_REVISION ? null : cached;
    }

    // This record IS the published revision — no query needed.
    // P record: always the published revision by definition.
    // L record with status "published": L and P point to the same revision.
    const data = ctx.record.data as Record<string, unknown>;
    const originalSK = ctx.original.SK;
    const isPublishedRevision =
        originalSK === "P" || (originalSK === "L" && data.status === "published");

    if (isPublishedRevision) {
        const version = data.version as number;
        ctx.cache.set(cacheKey, version);
        return version;
    }

    ctx.logger.debug(`Querying for published revision of ${ctx.original.PK}...`);
    const published = await ctx.querySourceRecord(ctx.original.PK, "P");
    const version = published ? (published.version as number) : NO_PUBLISHED_REVISION;

    ctx.cache.set(cacheKey, version);
    return version === NO_PUBLISHED_REVISION ? null : version;
}
