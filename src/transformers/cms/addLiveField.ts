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
        data.live = publishedVersion === null ? null : { version: publishedVersion };
    }
);

function readPositiveIntegerVersion(record: Record<string, unknown>): number | null {
    const nested = record.data as Record<string, unknown> | undefined;
    const raw = record.version !== undefined ? record.version : nested?.version;
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return null;
}

async function resolvePublishedVersion(
    ctx: DdbCoreTransformContext.Interface<BaseRecord>
): Promise<number | null> {
    const cacheKey = `live:${ctx.original.PK}`;

    const cached = ctx.cache.get<number>(cacheKey);
    if (cached !== undefined) {
        return cached === NO_PUBLISHED_REVISION ? null : cached;
    }

    const data = ctx.record.data as Record<string, unknown>;
    const originalSK = ctx.original.SK;
    const isPublishedRevision =
        originalSK === "P" || (originalSK === "L" && data.status === "published");

    if (isPublishedRevision) {
        const version = readPositiveIntegerVersion(data);
        if (version === null) {
            ctx.logger.warn(
                `addLiveField: ${ctx.original.PK} ${originalSK} is the published revision but has no positive integer version — writing live: null`
            );
            ctx.cache.set(cacheKey, NO_PUBLISHED_REVISION);
            return null;
        }
        ctx.cache.set(cacheKey, version);
        return version;
    }

    ctx.logger.debug(`Querying for published revision of ${ctx.original.PK}...`);
    const published = await ctx.querySourceRecord(ctx.original.PK, "P");
    if (!published) {
        ctx.cache.set(cacheKey, NO_PUBLISHED_REVISION);
        return null;
    }

    const version = readPositiveIntegerVersion(published);
    if (version === null) {
        ctx.logger.warn(
            `addLiveField: P record for ${ctx.original.PK} has no positive integer version — writing live: null`
        );
        ctx.cache.set(cacheKey, NO_PUBLISHED_REVISION);
        return null;
    }

    ctx.cache.set(cacheKey, version);
    return version;
}
