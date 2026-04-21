import { describe, it, expect } from "vitest";
import { wrapInData } from "~/transformers/global/wrapInData.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("wrapInData", () => {
    it("wraps non-reserved attributes into a data envelope", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#P#home",
            SK: "record#1",
            TYPE: "cms.entry",
            name: "Alice",
            age: 42
        });
        wrapInData(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.PK).toBe("T#root#P#home");
        expect(record.SK).toBe("record#1");
        expect(record.TYPE).toBe("cms.entry");
        expect(record.data).toEqual({ name: "Alice", age: 42 });
        expect(record.name).toBeUndefined();
        expect(record.age).toBeUndefined();
    });

    it("leaves records that already have a data envelope unchanged", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#P#home",
            SK: "record#1",
            TYPE: "cms.entry",
            data: { preserved: true }
        });
        wrapInData(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.data).toEqual({ preserved: true });
    });
});
