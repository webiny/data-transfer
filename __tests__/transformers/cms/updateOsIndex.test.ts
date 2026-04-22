import { describe, it, expect } from "vitest";
import { updateOsIndex } from "~/transformers/cms/updateOsIndex.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("updateOsIndex", () => {
    it("rewrites index suffix when modelId was renamed (fmFile → wbyFmFile)", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-fmfile",
            data: { modelId: "fmFile", values: {} }
        });

        // Simulate updateModelIds having already run — mutates data.modelId in place.
        // With structuredClone in fakeContext, ctx.original.data.modelId stays "fmFile".
        (ctx.record.data as Record<string, unknown>).modelId = "wbyFmFile";

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-wbyfmfile"
        );
    });

    it("rewrites index suffix for acoFolder → wbyAcoFolder", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-acofolder",
            data: { modelId: "acoFolder", values: {} }
        });

        (ctx.record.data as Record<string, unknown>).modelId = "wbyAcoFolder";

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-wbyacofolder"
        );
    });

    it("leaves index unchanged when modelId has no rename mapping", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-blogpost",
            data: { modelId: "blogPost", values: {} }
        });

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-blogpost"
        );
    });

    it("leaves index unchanged when old and new modelId are identical", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-wbyfmfile",
            data: { modelId: "wbyFmFile", values: {} }
        });

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-wbyfmfile"
        );
    });

    it("is a no-op when record.data is absent", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-fmfile"
        });

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-fmfile"
        );
    });
});
