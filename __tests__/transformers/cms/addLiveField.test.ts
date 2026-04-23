import { describe, it, expect, vi } from "vitest";
import { addLiveField } from "~/transformers/cms/addLiveField.ts";
import { makeFakeDdbCoreContext } from "../fakeContext.ts";

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

        expect((ctx.record.data as Record<string, unknown>).live).toBeUndefined();
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

        expect((ctxRev.record.data as Record<string, unknown>).live).toBeUndefined();
        expect(ctxRev.querySourceRecord).not.toHaveBeenCalled();
    });
});
