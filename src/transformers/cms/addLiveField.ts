import { createTransformer } from "~/transformers/createTransformer.ts";
import type { DdbCoreTransformContext } from "~/features/TransformContext/abstractions/contextAliases.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

const NO_PUBLISHED_REVISION = -1;

export const addLiveField = createTransformer<DdbCoreTransformContext.Interface<BaseRecord>>(
    "addLiveField",
    async ctx => {
        const data = ctx.record.data as Record<string, unknown> | undefined;
        if (!data) {
            return;
        }

        const publishedVersion = await resolvePublishedVersion(ctx);
        if (publishedVersion === null) {
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
    if (ctx.record.SK === "P") {
        const version = (ctx.record.data as Record<string, unknown>).version as number;
        ctx.cache.set(cacheKey, version);
        return version;
    }

    const published = await ctx.querySourceRecord(ctx.original.PK, "P");
    const version = published ? (published.version as number) : NO_PUBLISHED_REVISION;

    ctx.cache.set(cacheKey, version);
    return version === NO_PUBLISHED_REVISION ? null : version;
}
