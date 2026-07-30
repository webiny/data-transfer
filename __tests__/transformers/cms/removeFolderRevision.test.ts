import { describe, it, expect } from "vitest";
import { removeFolderRevision } from "~/transformers/cms/removeFolderRevision.js";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("removeFolderRevision", () => {
    it("removes #0001 suffix from data.location.folderId", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "REV#0001",
            TYPE: "cms.entry",
            data: {
                location: {
                    folderId: "folder-xyz#0001"
                },
                values: {}
            }
        });
        removeFolderRevision(ctx);
        const data = ctx.record.data as Record<string, unknown>;
        const location = data.location as Record<string, unknown>;
        expect(location.folderId).toBe("folder-xyz");
    });

    it("removes object@location from values and strips revision from parentId for wbyAcoFolder", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "REV#0001",
            TYPE: "cms.entry",
            data: {
                modelId: "wbyAcoFolder",
                location: { folderId: "root" },
                values: {
                    "object@location": { folderId: "root" },
                    "text@parentId": "parent-folder#42"
                }
            }
        });
        removeFolderRevision(ctx);
        const data = ctx.record.data as Record<string, unknown>;
        const values = data.values as Record<string, unknown>;
        expect(values["object@location"]).toBeUndefined();
        expect(values["text@parentId"]).toBe("parent-folder");
    });
});
