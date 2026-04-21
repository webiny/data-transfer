import { describe, it, expect } from "vitest";
import { updateModelIds } from "~/transformers/cms/updateModelIds.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("updateModelIds", () => {
    it("rewrites legacy modelIds inside PK/SK and data.modelId", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#fmFile#abc",
            SK: "REV#0001",
            GSI1_PK: "T#root#CMS#CME#fmFile",
            GSI1_SK: "abc",
            TYPE: "cms.entry",
            data: {
                modelId: "fmFile",
                values: {}
            }
        });

        updateModelIds(ctx);

        expect(ctx.record.PK).toBe("T#root#CMS#CME#wbyFmFile#abc");
        expect(ctx.record.GSI1_PK).toBe("T#root#CMS#CME#wbyFmFile");
        const data = ctx.record.data as Record<string, unknown>;
        expect(data.modelId).toBe("wbyFmFile");
    });

    it("leaves unrelated modelIds untouched", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#blogPost#abc",
            SK: "REV#0001",
            TYPE: "cms.entry",
            data: {
                modelId: "blogPost",
                values: {}
            }
        });

        updateModelIds(ctx);

        expect(ctx.record.PK).toBe("T#root#CMS#CME#blogPost#abc");
        const data = ctx.record.data as Record<string, unknown>;
        expect(data.modelId).toBe("blogPost");
    });
});
