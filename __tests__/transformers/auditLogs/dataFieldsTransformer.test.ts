import { describe, it, expect } from "vitest";
import { dataFieldsTransformer } from "~/transformers/auditLogs/dataFieldsTransformer.js";
import { makeFakeBaseContext } from "../fakeContext.ts";

const COMPRESSED_CONTENT = '{"compression":"gzip","value":"H4sI..."}';

const SOURCE_RECORD = {
    PK: "T#root#L#en-US#CMS#CME#wby-aco-686f7147c0aada0002aa5d0e",
    SK: "L",
    tenant: "root",
    entryId: "wby-aco-686f7147c0aada0002aa5d0e",
    modelId: "acoSearchRecord-auditlogs",
    values: {
        "object@data": {
            "text@app": "SECURITY",
            "text@action": "UPDATE",
            "text@message": "User updated",
            "text@entity": "USER",
            "text@entityId": "58a2841f-9831-4b37-92e6-e04e40132db6",
            "text@data": COMPRESSED_CONTENT
        },
        "text@tags": ["tag-a", "tag-b"],
        "text@content": "User updated"
    }
};

describe("dataFieldsTransformer", () => {
    it("extracts app from values[object@data][text@app]", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).app).toBe("SECURITY");
    });

    it("extracts action", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).action).toBe("UPDATE");
    });

    it("extracts message", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).message).toBe("User updated");
    });

    it("extracts entity", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).entity).toBe("USER");
    });

    it("uses root entryId as entityId", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).entityId).toBe(
            "wby-aco-686f7147c0aada0002aa5d0e"
        );
    });

    it("extracts tags array", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).tags).toEqual(["tag-a", "tag-b"]);
    });

    it("defaults tags to empty array when missing", () => {
        const rec = {
            ...SOURCE_RECORD,
            values: { ...SOURCE_RECORD.values, "text@tags": undefined }
        };
        const ctx = makeFakeBaseContext(rec);
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).tags).toEqual([]);
    });

    it("extracts content as the already-compressed text@data string", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).content).toBe(COMPRESSED_CONTENT);
    });
});
