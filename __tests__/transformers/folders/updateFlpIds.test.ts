import { describe, it, expect } from "vitest";
import { updateFlpIds } from "~/transformers/folders/updateFlpIds.js";
import { makeFakeBaseContext } from "../fakeContext.ts";

interface FlpPermission {
    inheritedFrom?: string;
    level: string;
    target: string;
}

interface FlpData {
    id: string;
    parentId: string;
    permissions?: FlpPermission[];
}

const getData = (ctx: { record: unknown }): FlpData => (ctx.record as { data: FlpData }).data;

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

        const data = getData(ctx);
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

        const data = getData(ctx);
        expect(data.id).toBe("abc123");
        expect(data.parentId).toBe("def456");
    });

    it("strips revision suffix from inheritedFrom in permissions", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#FLP#a1b2c3d4e5f6#0001",
            SK: "A",
            TYPE: "flp",
            data: {
                id: "a1b2c3d4e5f6#0001",
                parentId: "f6e5d4c3b2a1#0001",
                permissions: [
                    {
                        inheritedFrom: "parent:f6e5d4c3b2a1#0001",
                        level: "editor",
                        target: "team:design-editors"
                    },
                    {
                        inheritedFrom: "parent:f6e5d4c3b2a1#0001",
                        level: "viewer",
                        target: "team:marketing-viewers"
                    }
                ]
            }
        });

        updateFlpIds(ctx);

        const data = getData(ctx);
        expect(data.id).toBe("a1b2c3d4e5f6");
        expect(data.parentId).toBe("f6e5d4c3b2a1");
        expect(data.permissions?.[0]?.inheritedFrom).toBe("parent:f6e5d4c3b2a1");
        expect(data.permissions?.[1]?.inheritedFrom).toBe("parent:f6e5d4c3b2a1");
    });

    it("handles any 4-digit revision suffix, not just #0001", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#FLP",
            SK: "A",
            TYPE: "flp",
            data: {
                id: "abc123#0010",
                parentId: "def456#0099",
                permissions: [
                    {
                        inheritedFrom: "parent:def456#0042",
                        level: "editor",
                        target: "team:ops-admins"
                    }
                ]
            }
        });

        updateFlpIds(ctx);

        const data = getData(ctx);
        expect(data.id).toBe("abc123");
        expect(data.parentId).toBe("def456");
        expect(data.permissions?.[0]?.inheritedFrom).toBe("parent:def456");
    });

    it("skips permissions without inheritedFrom", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#FLP",
            SK: "A",
            TYPE: "flp",
            data: {
                id: "abc123#0001",
                parentId: "def456#0001",
                permissions: [
                    {
                        level: "editor",
                        target: "team:content-editors"
                    },
                    {
                        inheritedFrom: "parent:def456#0001",
                        level: "viewer",
                        target: "team:content-viewers"
                    }
                ]
            }
        });

        updateFlpIds(ctx);

        const data = getData(ctx);
        expect(data.permissions?.[0]?.inheritedFrom).toBeUndefined();
        expect(data.permissions?.[1]?.inheritedFrom).toBe("parent:def456");
    });

    it("handles record with no permissions array", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#FLP",
            SK: "A",
            TYPE: "flp",
            data: {
                id: "abc123#0001",
                parentId: "def456#0001"
            }
        });

        expect(() => updateFlpIds(ctx)).not.toThrow();

        const data = getData(ctx);
        expect(data.id).toBe("abc123");
        expect(data.parentId).toBe("def456");
        expect(data.permissions).toBeUndefined();
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
