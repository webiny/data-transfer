import { mdbid } from "@webiny/utils/mdbid.js";
import { createTransformer } from "~/transformers/createTransformer.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

interface CreatedBy {
    id: string;
    displayName: string;
    type: string;
}

interface CreatorFields {
    createdBy: CreatedBy;
    createdOn: string;
}

interface CompressedEnvelope {
    value: string;
    compression: string;
}

/**
 * Tries root fields first (priority: revision > plain > saved), then falls
 * back to decompressing values["object@data"]["text@data"].
 */
async function resolveCreatorFields(
    record: BaseRecord,
    ctx: BaseTransformContext.Interface<BaseRecord>
): Promise<CreatorFields | null> {
    const createdBy = pickCreatedBy(record);
    const createdOn = pickCreatedOn(record);

    if (createdBy && createdOn) {
        return { createdBy, createdOn };
    }

    const values = record.values as Record<string, unknown> | undefined;
    const data = values?.["object@data"] as Record<string, unknown> | undefined;
    const rawContent = data?.["text@data"];

    if (typeof rawContent !== "string") {
        return null;
    }

    let envelope: CompressedEnvelope;
    try {
        envelope = JSON.parse(rawContent) as CompressedEnvelope;
    } catch {
        ctx.logger.warn(
            `auditLogs/coreFields: could not parse text@data envelope for ${record.PK}/${record.SK}`
        );
        return null;
    }

    let payload: unknown;
    try {
        const raw = await ctx.compressionHandler.decompress(envelope);
        // The handler may return a JSON string rather than a parsed object.
        payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        ctx.logger.warn(`auditLogs/coreFields: decompression failed for ${record.PK}/${record.SK}`);
        return null;
    }

    const source = Array.isArray(payload) ? payload[0] : payload;
    if (!source || typeof source !== "object") {
        return null;
    }

    // Some payloads nest creator info under before/after (e.g. UPDATE actions).
    const candidates = [
        source,
        (source as Record<string, unknown>).after,
        (source as Record<string, unknown>).before
    ].filter((c): c is Record<string, unknown> => !!c && typeof c === "object");

    let decompressedCreatedBy: CreatedBy | null = null;
    let decompressedCreatedOn: string | null = null;

    for (const candidate of candidates) {
        if (!decompressedCreatedBy) {
            decompressedCreatedBy = pickCreatedBy(candidate);
        }
        if (!decompressedCreatedOn) {
            decompressedCreatedOn = pickCreatedOn(candidate);
        }
        if (decompressedCreatedBy && decompressedCreatedOn) {
            break;
        }
    }

    if (!decompressedCreatedBy || !decompressedCreatedOn) {
        return null;
    }

    return {
        createdBy: decompressedCreatedBy,
        createdOn: decompressedCreatedOn
    };
}

function pickCreatedBy(source: Record<string, any>): CreatedBy | null {
    const candidate =
        source.revisionCreatedBy || source.createdBy || source.savedBy || source.revisionSavedBy;
    if (!candidate?.id) {
        return null;
    }
    return {
        id: candidate.id,
        displayName: candidate.displayName || candidate.id,
        type: candidate.type || "unknown"
    };
}

function pickCreatedOn(source: Record<string, unknown>): string | null {
    const candidate = source.revisionCreatedOn || source.createdOn || source.savedOn;
    if (typeof candidate !== "string") {
        return null;
    }
    try {
        return new Date(candidate).toISOString();
    } catch {
        return null;
    }
}

export const coreFieldsTransformer = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "auditLogs/coreFields",
    async ctx => {
        const { record } = ctx;

        const creator = await resolveCreatorFields(record, ctx);

        if (!creator) {
            ctx.logger.warn(
                `auditLogs/coreFields: could not resolve createdBy/createdOn for ${record.PK}/${record.SK} — record will be skipped`
            );
            return;
        }

        record.id = mdbid();
        record.createdBy = creator.createdBy;
        record.createdOn = creator.createdOn;
        record.expiresAt = new Date(Date.now() + SIXTY_DAYS_MS).toISOString();
    }
);
