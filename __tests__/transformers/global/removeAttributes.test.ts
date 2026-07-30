import { describe, it, expect } from "vitest";
import { removeAttributes } from "~/transformers/global/removeAttributes.js";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("removeAttributes", () => {
    it("removes webinyVersion from the data envelope", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#P#home",
            SK: "record#1",
            TYPE: "cms.entry",
            data: { webinyVersion: "5.40.0", title: "Hello" }
        });
        removeAttributes(ctx);
        const record = ctx.record as Record<string, unknown>;
        const data = record.data as Record<string, unknown>;
        expect(data.webinyVersion).toBeUndefined();
        expect(data.title).toBe("Hello");
    });

    it("does nothing when there is no data envelope", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#P#home",
            SK: "record#1",
            TYPE: "cms.entry"
        });
        removeAttributes(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.data).toBeUndefined();
    });
});
