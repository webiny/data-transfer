import { describe, it, expect } from "vitest";
import { updateOsIndex } from "~/transformers/cms/updateOsIndex.js";
import { makeFakeOsContext } from "../fakeContext.ts";

const BASE_RECORD = {
    PK: "T#root#CMS#CME#abc",
    SK: "L",
    TYPE: "cms.entry.l",
    _et: "CmsEntriesElasticsearch",
    _ct: "2024-01-01T00:00:00.000Z",
    _md: "2024-01-01T00:00:00.000Z"
};

describe("updateOsIndex", () => {
    it("sets index using configurations.es for the current modelId (fmFile → wbyFmFile)", async () => {
        const ctx = makeFakeOsContext({
            ...BASE_RECORD,
            index: "root-headless-cms-en-us-fmfile",
            data: { modelId: "wbyFmFile", tenant: "root", values: {} }
        });

        await updateOsIndex(ctx);

        expect(ctx.record.index).toContain("wbyfmfile");
    });

    it("sets index for acoFolder → wbyAcoFolder", async () => {
        const ctx = makeFakeOsContext({
            ...BASE_RECORD,
            index: "root-headless-cms-en-us-acofolder",
            data: { modelId: "wbyAcoFolder", tenant: "root", values: {} }
        });

        await updateOsIndex(ctx);

        expect(ctx.record.index).toContain("wbyacofolder");
    });

    it("recomputes index even when modelId is unchanged", async () => {
        const ctx = makeFakeOsContext({
            ...BASE_RECORD,
            index: "root-headless-cms-en-us-blogpost",
            data: { modelId: "blogPost", tenant: "root", values: {} }
        });

        await updateOsIndex(ctx);

        expect(ctx.record.index).toContain("blogpost");
    });
});
