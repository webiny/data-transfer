import { describe, it, expect } from "vitest";
import { updateOsIndex } from "~/transformers/cms/updateOsIndex.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("updateOsIndex", () => {
    it("sets index to the value produced by configurations.es for the current modelId", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-fmfile",
            data: { modelId: "wbyFmFile", tenant: "root", values: {} }
        });

        await updateOsIndex(ctx);

        expect(typeof (ctx.record as Record<string, unknown>).index).toBe("string");
        expect((ctx.record as Record<string, unknown>).index).toContain("wbyfmfile");
    });

    it("recomputes index when modelId changes (acoFolder → wbyAcoFolder)", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-acofolder",
            data: { modelId: "wbyAcoFolder", tenant: "root", values: {} }
        });

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toContain("wbyacofolder");
    });

    it("always recomputes — even when modelId is unchanged", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-blogpost",
            data: { modelId: "blogPost", tenant: "root", values: {} }
        });

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toContain("blogpost");
    });
});
