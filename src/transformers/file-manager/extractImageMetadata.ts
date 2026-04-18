import sharp from "sharp";
import ExifReader from "exifreader";
import { createDdbTransformer } from "~/transformers/createDdbTransformer.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";

const CACHE_PREFIX = "imageMetadata:";

/**
 * Renames `object@meta` → `object@metadata` for all file records.
 * For raster images, reads the file from S3 and extracts dimensions, EXIF, and IPTC.
 * Results are cached by fileId via ctx.cache so each file is only fetched once.
 */
export const extractImageMetadata = createDdbTransformer("extractImageMetadata", async ctx => {
    const { record } = ctx;

    const data = record.data as Record<string, unknown> | undefined;
    if (!data) {
        return;
    }

    const values = data.values as Record<string, unknown> | undefined;
    if (!values) {
        return;
    }

    // Remove old meta field
    delete values["object@meta"];

    const type = values["text@type"] as string | undefined;
    const isRasterImage =
        type?.startsWith("image/") && !type.includes("svg") && !type.includes("xml");
    if (!isRasterImage) {
        values["object@metadata"] = {};
        return;
    }

    // Use cached result if we already extracted metadata for this file
    const fileId = getFileId(data);
    const cacheKey = fileId ? CACHE_PREFIX + fileId : undefined;
    if (cacheKey && ctx.cache.has(cacheKey)) {
        values["object@metadata"] = ctx.cache.get(cacheKey);
        return;
    }

    // Resolve the S3 key: use bucketKey from existing KV metadata in DB
    // (subsequent run), otherwise fall back to text@key (first run).
    const s3Key =
        (await resolveFileKeyFromDb(ctx, data)) || (values["text@key"] as string | undefined);
    if (!s3Key) {
        values["object@metadata"] = {};
        return;
    }

    try {
        const buffer = await ctx.getFile(s3Key);
        if (!buffer) {
            values["object@metadata"] = {};
            return;
        }

        const sharpMeta = await sharp(buffer).metadata();

        const extracted: Record<string, unknown> = {
            "object@image": {
                "number@width": sharpMeta.width,
                "number@height": sharpMeta.height,
                "text@format": sharpMeta.format,
                "number@orientation": sharpMeta.orientation ?? 1
            }
        };

        const tags = ExifReader.load(buffer, { expanded: true });

        if (tags.exif) {
            extracted["searchable-json@exif"] = cleanTags(tags.exif);
        }

        if (tags.iptc) {
            extracted["searchable-json@iptc"] = cleanTags(tags.iptc);
        }

        if (cacheKey) {
            ctx.cache.set(cacheKey, extracted);
        }
        values["object@metadata"] = extracted;
    } catch (err) {
        console.error(`[extractImageMetadata] key="${s3Key}":`, (err as Error).message);
        values["object@metadata"] = {};
    }
});

function getFileId(data: Record<string, unknown>): string | undefined {
    const id = (data.id || data.entryId) as string | undefined;
    return id?.replace(/#\d+$/, "");
}

/** Check source DB for an existing KV metadata record (subsequent migration run). */
async function resolveFileKeyFromDb(
    ctx: DdbTransformContext.Interface,
    data: Record<string, unknown>
): Promise<string | undefined> {
    const fileId = getFileId(data);
    if (!fileId) {
        return undefined;
    }

    const existing = await ctx.queryRecord(`KV#global:FileManager/File/${fileId}/Metadata`, "A");
    if (existing) {
        const value = (existing.data as any)?.value;
        if (value?.bucketKey) {
            return value.bucketKey;
        }
    }

    return undefined;
}

function cleanTags(tags: Record<string, any>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};

    for (const [key, tag] of Object.entries(tags)) {
        if (!tag || typeof tag !== "object") {
            continue;
        }

        if (tag.description !== undefined && tag.description !== null) {
            cleaned[key] = tag.description;
        } else if (Array.isArray(tag.value) && tag.value.length > 20) {
            // Skip large byte arrays
        } else if (tag.value !== undefined) {
            cleaned[key] = tag.value;
        }
    }

    return cleaned;
}
