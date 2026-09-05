import { describe, it, expect, vi } from "vitest";
import { addLiveField } from "~/transformers/cms/addLiveField.js";
import { makeFakeDdbCoreContext } from "../fakeContext.ts";
import { NoopLogger } from "../../helpers/NoopLogger.ts";

const BASE = {
    PK: "T#root#L#en-US#CMS#CME#CME#abc123",
    SK: "L",
    TYPE: "cms.entry.l",
    _et: "CmsEntry",
    _ct: "2024-01-01T00:00:00.000Z",
    _md: "2024-01-01T00:00:00.000Z",
    data: { entryId: "abc123", modelId: "blogPost", version: 3, values: {} }
};

describe("addLiveField", () => {
    it("sets data.live.version from the P record when found in source", async () => {
        const ctx = makeFakeDdbCoreContext(BASE);
        ctx.querySourceRecord = vi.fn().mockResolvedValue({ version: 2 });

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toEqual({ version: 2 });
        expect(ctx.querySourceRecord).toHaveBeenCalledWith(BASE.PK, "P");
    });

    it("skips data.live when no P record exists in source", async () => {
        const ctx = makeFakeDdbCoreContext(BASE);
        ctx.querySourceRecord = vi.fn().mockResolvedValue(null);

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toBeNull();
    });

    it("on a published L record uses data.version directly without querying", async () => {
        const ctx = makeFakeDdbCoreContext({
            ...BASE,
            SK: "L",
            TYPE: "cms.entry.l",
            data: { ...BASE.data, version: 3, status: "published" }
        });
        ctx.querySourceRecord = vi.fn();

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toEqual({ version: 3 });
        expect(ctx.querySourceRecord).not.toHaveBeenCalled();
    });

    it("on a draft L record queries source for P", async () => {
        const ctx = makeFakeDdbCoreContext({
            ...BASE,
            data: { ...BASE.data, version: 3, status: "draft" }
        });
        ctx.querySourceRecord = vi.fn().mockResolvedValue({ version: 2 });

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toEqual({ version: 2 });
        expect(ctx.querySourceRecord).toHaveBeenCalledWith(BASE.PK, "P");
    });

    it("on a P record uses data.version directly without querying", async () => {
        const ctx = makeFakeDdbCoreContext({
            ...BASE,
            SK: "P",
            TYPE: "cms.entry.p",
            data: { ...BASE.data, version: 2 }
        });
        ctx.querySourceRecord = vi.fn();

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toEqual({ version: 2 });
        expect(ctx.querySourceRecord).not.toHaveBeenCalled();
    });

    it("uses cache on second record for same entry, skipping the query", async () => {
        const ctxL = makeFakeDdbCoreContext(BASE);
        ctxL.querySourceRecord = vi.fn().mockResolvedValue({ version: 2 });

        // Process L record — populates cache
        await addLiveField(ctxL);

        // REV record shares same PK and cache instance
        const ctxRev = makeFakeDdbCoreContext(
            { ...BASE, SK: "REV#0001", TYPE: "cms.entry" },
            { cache: ctxL.cache }
        );
        ctxRev.querySourceRecord = vi.fn();

        await addLiveField(ctxRev);

        expect((ctxRev.record.data as Record<string, unknown>).live).toEqual({ version: 2 });
        expect(ctxRev.querySourceRecord).not.toHaveBeenCalled();
    });

    it("caches the -1 sentinel and skips live on subsequent records when no P exists", async () => {
        const ctxL = makeFakeDdbCoreContext(BASE);
        ctxL.querySourceRecord = vi.fn().mockResolvedValue(null);

        await addLiveField(ctxL);

        const ctxRev = makeFakeDdbCoreContext(
            { ...BASE, SK: "REV#0001", TYPE: "cms.entry" },
            { cache: ctxL.cache }
        );
        ctxRev.querySourceRecord = vi.fn();

        await addLiveField(ctxRev);

        expect((ctxRev.record.data as Record<string, unknown>).live).toBeNull();
        expect(ctxRev.querySourceRecord).not.toHaveBeenCalled();
    });

    it("reads version from data when P comes back in the decompressed OS row shape", async () => {
        const ctx = makeFakeDdbCoreContext({
            ...BASE,
            data: { ...BASE.data, version: 3, status: "draft" }
        });
        ctx.querySourceRecord = vi.fn().mockResolvedValue({
            PK: BASE.PK,
            SK: "P",
            index: "root-headless-cms-en-us-blogpost",
            data: { modelId: "blogPost", version: 2, status: "published" },
            _ct: "2024-01-01T00:00:00.000Z",
            _et: "CmsEntriesElasticsearch",
            _md: "2024-01-01T00:00:00.000Z"
        });

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toEqual({ version: 2 });
    });

    it("never emits { version: undefined } — a raw compressed P row yields live: null and warns", async () => {
        const logger = new NoopLogger();
        const ctx = makeFakeDdbCoreContext(BASE, { logger });
        ctx.querySourceRecord = vi.fn().mockResolvedValue({
            PK: BASE.PK,
            SK: "P",
            index: "root-headless-cms-en-us-blogpost",
            data: { compression: "gzip", value: "H4sIAAAAAAAAA6tWKkpNLKlUslIqLcpRqgUAn7mB6RAAAAA=" }
        });

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toBeNull();
        expect(logger.entries.some(e => e.level === "warn" && e.message.includes(BASE.PK))).toBe(
            true
        );
    });

    it("treats a non-integer P version as no published revision", async () => {
        const ctx = makeFakeDdbCoreContext(BASE);
        ctx.querySourceRecord = vi.fn().mockResolvedValue({ version: "2" });

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toBeNull();
    });

    it("queries P for an unpublished L record and sets live: null when none exists", async () => {
        const ctx = makeFakeDdbCoreContext({
            ...BASE,
            data: { ...BASE.data, version: 4, status: "unpublished" }
        });
        ctx.querySourceRecord = vi.fn().mockResolvedValue(null);

        await addLiveField(ctx);

        expect(ctx.querySourceRecord).toHaveBeenCalledWith(BASE.PK, "P");
        expect((ctx.record.data as Record<string, unknown>).live).toBeNull();
    });

    it("live.version is a number whenever live is non-null", async () => {
        const shapes: Array<Record<string, unknown> | null> = [
            { version: 2 },
            { data: { version: 5 } },
            { version: 0 },
            { version: 1.5 },
            { data: {} },
            null
        ];
        for (const shape of shapes) {
            const ctx = makeFakeDdbCoreContext(BASE);
            ctx.querySourceRecord = vi.fn().mockResolvedValue(shape);
            await addLiveField(ctx);
            const live = (ctx.record.data as Record<string, unknown>).live as {
                version: unknown;
            } | null;
            if (live !== null) {
                expect(typeof live.version).toBe("number");
            }
        }
    });
});
