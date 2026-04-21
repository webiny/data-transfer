import { describe, it, expect } from "vitest";
import { updateFlpIds } from "~/transformers/folders/updateFlpIds.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

interface FlpData {
    id: string;
    parentId: string;
}

describe("updateFlpIds", () => {
    it("strips #0001 revision suffix from data.id and data.parentId", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#FLP",
            SK: "flp-id",
            TYPE: "flp",
            data: {
                id: "abc123#0001",
                parentId: "def456#0001"
            }
        });

        updateFlpIds(ctx);

        const data = (ctx.record as unknown as { data: FlpData }).data;
        expect(data.id).toBe("abc123");
        expect(data.parentId).toBe("def456");
    });

    it("leaves ids without #0001 suffix untouched", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#FLP",
            SK: "flp-id",
            TYPE: "flp",
            data: {
                id: "abc123",
                parentId: "def456"
            }
        });

        updateFlpIds(ctx);

        const data = (ctx.record as unknown as { data: FlpData }).data;
        expect(data.id).toBe("abc123");
        expect(data.parentId).toBe("def456");
    });

    it("is a no-op when record.data is missing", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#FLP",
            SK: "flp-id",
            TYPE: "flp"
        });

        expect(() => updateFlpIds(ctx)).not.toThrow();
        expect((ctx.record as { data?: unknown }).data).toBeUndefined();
    });
});
