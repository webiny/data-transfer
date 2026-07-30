import { describe, it, expect } from "vitest";
import { fixCmePk } from "~/transformers/cms/fixCmePk.js";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("fixCmePk", () => {
    it("removes duplicate #CME#CME# segment from PK", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#L#en-US#CMS#CME#CME#698262002baa500002afd371",
            SK: "REV#0001",
            TYPE: "cms.entry"
        });
        fixCmePk(ctx);
        expect(ctx.record.PK).toBe("T#root#L#en-US#CMS#CME#698262002baa500002afd371");
    });

    it("leaves PK unchanged when it does not contain #CME#CME#", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#697fba1ee12d630002b7ad15",
            SK: "REV#0001",
            TYPE: "cms.entry"
        });
        fixCmePk(ctx);
        expect(ctx.record.PK).toBe("T#root#CMS#CME#697fba1ee12d630002b7ad15");
    });
});
