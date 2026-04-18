import { describe, it, expect } from "vitest";
import { removeLocale } from "~/transformers/global/removeLocale.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("removeLocale", () => {
    it("removes locale segments from PK, SK, and GSI keys", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#L#en-US#P#home",
            SK: "entry#L#en-US#1",
            GSI1_PK: "T#root#L#en-US#TYPE#foo",
            GSI1_SK: "entry#L#en-US#created",
            TYPE: "cms.entry",
            locale: "en-US",
            data: { locale: "en-US", title: "Hello" }
        });
        removeLocale(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.PK).toBe("T#root#P#home");
        expect(record.SK).toBe("entry#1");
        expect(record.GSI1_PK).toBe("T#root#TYPE#foo");
        expect(record.GSI1_SK).toBe("entry#created");
        expect(record.locale).toBeUndefined();
        expect((record.data as Record<string, unknown>).locale).toBeUndefined();
        expect((record.data as Record<string, unknown>).title).toBe("Hello");
    });

    it("leaves keys without locale segments unchanged", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#P#home",
            SK: "record#1",
            TYPE: "cms.entry"
        });
        removeLocale(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.PK).toBe("T#root#P#home");
        expect(record.SK).toBe("record#1");
    });
});
