import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { coreFieldsTransformer } from "~/transformers/auditLogs/coreFieldsTransformer.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";
import type { CompressionHandler } from "@webiny/utils/exports/api.js";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const FROZEN_NOW = new Date("2025-07-10T12:00:00.000Z").getTime();

const CREATOR = {
    id: "identity-12345678",
    displayName: "John Doe",
    type: "admin"
};

const ROOT_RECORD = {
    PK: "T#root#L#en-US#CMS#CME#test-entry-id",
    SK: "L",
    tenant: "root",
    entryId: "test-entry-id",
    modelId: "acoSearchRecord-auditlogs",
    revisionCreatedBy: CREATOR,
    revisionCreatedOn: "2025-07-10T07:52:39.413Z"
};

/** Returns payload as a parsed object (common case). */
function makeCompressionHandler(decompressedPayload: unknown): CompressionHandler.Interface {
    return {
        compress: async (data: unknown) => ({
            value: JSON.stringify(data),
            compression: "json"
        }),
        decompress: async (_envelope: unknown) => decompressedPayload as never
    };
}

/** Returns payload as a JSON string — mirrors what the real gzip handler emits. */
function makeStringCompressionHandler(decompressedPayload: unknown): CompressionHandler.Interface {
    return {
        compress: async (data: unknown) => ({
            value: JSON.stringify(data),
            compression: "json"
        }),
        decompress: async (_envelope: unknown) => JSON.stringify(decompressedPayload) as never
    };
}

function makeEnvelope(payload: unknown): string {
    return JSON.stringify({ value: "ignored-by-mock", compression: "gzip" });
}

describe("coreFieldsTransformer — root fields present", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(FROZEN_NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("sets a fresh mdbid as id", async () => {
        const ctx = makeFakeBaseContext({ ...ROOT_RECORD });
        await coreFieldsTransformer(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(typeof record.id).toBe("string");
        expect((record.id as string).length).toBeGreaterThan(0);
    });

    it("copies revisionCreatedBy to createdBy", async () => {
        const ctx = makeFakeBaseContext({ ...ROOT_RECORD });
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdBy).toEqual(CREATOR);
    });

    it("copies revisionCreatedOn to createdOn", async () => {
        const ctx = makeFakeBaseContext({ ...ROOT_RECORD });
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdOn).toBe("2025-07-10T07:52:39.413Z");
    });

    it("sets expiresAt to 60 days from now as ISO string", async () => {
        const ctx = makeFakeBaseContext({ ...ROOT_RECORD });
        await coreFieldsTransformer(ctx);
        const expected = new Date(FROZEN_NOW + SIXTY_DAYS_MS).toISOString();
        expect((ctx.record as Record<string, unknown>).expiresAt).toBe(expected);
    });

    it("falls back to createdBy when revisionCreatedBy is absent", async () => {
        const record = {
            ...ROOT_RECORD,
            revisionCreatedBy: undefined,
            revisionCreatedOn: undefined,
            createdBy: CREATOR,
            createdOn: "2025-07-10T07:52:39.413Z"
        };
        const ctx = makeFakeBaseContext(record);
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdBy).toEqual(CREATOR);
    });

    it("falls back to savedBy when neither revision nor plain createdBy exist", async () => {
        const record = {
            ...ROOT_RECORD,
            revisionCreatedBy: undefined,
            revisionCreatedOn: undefined,
            savedBy: CREATOR,
            savedOn: "2025-07-10T07:52:39.413Z"
        };
        const ctx = makeFakeBaseContext(record);
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdBy).toEqual(CREATOR);
        expect((ctx.record as Record<string, unknown>).createdOn).toBe("2025-07-10T07:52:39.413Z");
    });
});

describe("coreFieldsTransformer — decompression fallback", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(FROZEN_NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("extracts createdBy from decompressed object when root fields are absent", async () => {
        const payload = {
            revisionCreatedBy: CREATOR,
            revisionCreatedOn: "2025-07-10T07:52:39.413Z"
        };
        const record = {
            ...ROOT_RECORD,
            revisionCreatedBy: undefined,
            revisionCreatedOn: undefined,
            values: {
                "object@data": { "text@data": makeEnvelope(payload) }
            }
        };
        const ctx = makeFakeBaseContext(record, {
            compressionHandler: makeCompressionHandler(payload)
        });
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdBy).toEqual(CREATOR);
        expect((ctx.record as Record<string, unknown>).createdOn).toBe("2025-07-10T07:52:39.413Z");
    });

    it("extracts from first entry when decompressed result is an array", async () => {
        const payload = [
            { revisionCreatedBy: CREATOR, revisionCreatedOn: "2025-07-10T07:52:39.413Z" },
            { revisionCreatedBy: { id: "other" }, revisionCreatedOn: "2025-07-11T00:00:00.000Z" }
        ];
        const record = {
            ...ROOT_RECORD,
            revisionCreatedBy: undefined,
            revisionCreatedOn: undefined,
            values: {
                "object@data": { "text@data": makeEnvelope(payload) }
            }
        };
        const ctx = makeFakeBaseContext(record, {
            compressionHandler: makeCompressionHandler(payload)
        });
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdBy).toEqual(CREATOR);
    });

    it("uses savedBy from decompressed payload as fallback", async () => {
        const payload = { savedBy: CREATOR, savedOn: "2025-07-10T07:52:39.413Z" };
        const record = {
            ...ROOT_RECORD,
            revisionCreatedBy: undefined,
            revisionCreatedOn: undefined,
            values: {
                "object@data": { "text@data": makeEnvelope(payload) }
            }
        };
        const ctx = makeFakeBaseContext(record, {
            compressionHandler: makeCompressionHandler(payload)
        });
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdBy).toEqual(CREATOR);
        expect((ctx.record as Record<string, unknown>).createdOn).toBe("2025-07-10T07:52:39.413Z");
    });

    it("handles double-encoded JSON — compressionHandler returns a string (DELETE action)", async () => {
        // DELETE actions: decompressed payload is the entry itself (flat object)
        const decompressedPayload = {
            revisionCreatedBy: CREATOR,
            createdBy: CREATOR,
            revisionCreatedOn: "2026-01-08T08:48:52.031Z",
            createdOn: "2026-01-08T08:48:52.031Z"
        };
        const record = {
            PK: "T#root#L#en-US#CMS#CME#test-delete-entry",
            SK: "L",
            entryId: "test-delete-entry",
            modelId: "acoSearchRecord-auditlogs",
            tenant: "root",
            TYPE: "cms.entry.l",
            values: {
                "object@data": {
                    "text@action": "DELETE",
                    "text@data": JSON.stringify({ compression: "gzip", value: "H4sI..." })
                }
            }
        };
        const ctx = makeFakeBaseContext(record, {
            compressionHandler: makeStringCompressionHandler(decompressedPayload)
        });
        await coreFieldsTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect((r.createdBy as { id: string }).id).toBe("identity-12345678");
        expect(r.createdOn).toBe("2026-01-08T08:48:52.031Z");
    });

    it("extracts createdBy from before/after envelope — UPDATE action", async () => {
        // UPDATE actions: decompressed payload is { before: {...}, after: {...} }
        const decompressedPayload = {
            before: {
                revisionCreatedBy: CREATOR,
                createdBy: CREATOR,
                revisionCreatedOn: "2026-01-13T15:48:56.453Z",
                createdOn: "2026-01-13T15:48:56.453Z"
            },
            after: {
                revisionCreatedBy: CREATOR,
                revisionCreatedOn: "2026-01-13T15:48:56.453Z"
            }
        };
        const record = {
            PK: "T#root#L#en-US#CMS#CME#test-update-entry",
            SK: "L",
            entryId: "test-update-entry",
            modelId: "acoSearchRecord-auditlogs",
            tenant: "root",
            TYPE: "cms.entry.l",
            values: {
                "object@data": {
                    "text@action": "UPDATE",
                    "text@data": JSON.stringify({ compression: "gzip", value: "H4sI..." })
                }
            }
        };
        const ctx = makeFakeBaseContext(record, {
            compressionHandler: makeStringCompressionHandler(decompressedPayload)
        });
        await coreFieldsTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect((r.createdBy as { id: string }).id).toBe("identity-12345678");
        expect(r.createdOn).toBe("2026-01-13T15:48:56.453Z");
    });
});

describe("coreFieldsTransformer — skip cases", () => {
    it("does not set fields when decompression fails", async () => {
        const record = {
            ...ROOT_RECORD,
            revisionCreatedBy: undefined,
            revisionCreatedOn: undefined,
            values: { "object@data": { "text@data": makeEnvelope({}) } }
        };
        const ctx = makeFakeBaseContext(record, {
            compressionHandler: {
                compress: async () => ({ value: "", compression: "gzip" }),
                decompress: async () => {
                    throw new Error("decompress error");
                }
            }
        });
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdBy).toBeUndefined();
        expect((ctx.record as Record<string, unknown>).id).toBeUndefined();
    });

    it("does not set fields when decompressed payload has no creator info", async () => {
        const payload = { someOtherField: "value" };
        const record = {
            ...ROOT_RECORD,
            revisionCreatedBy: undefined,
            revisionCreatedOn: undefined,
            values: { "object@data": { "text@data": makeEnvelope(payload) } }
        };
        const ctx = makeFakeBaseContext(record, {
            compressionHandler: makeCompressionHandler(payload)
        });
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdBy).toBeUndefined();
        expect((ctx.record as Record<string, unknown>).id).toBeUndefined();
    });

    it("does not set fields when text@data is absent and root fields are missing", async () => {
        const record = {
            ...ROOT_RECORD,
            revisionCreatedBy: undefined,
            revisionCreatedOn: undefined
        };
        const ctx = makeFakeBaseContext(record);
        await coreFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).createdBy).toBeUndefined();
        expect((ctx.record as Record<string, unknown>).id).toBeUndefined();
    });
});
