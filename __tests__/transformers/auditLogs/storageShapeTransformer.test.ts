import { describe, it, expect } from "vitest";
import { storageShapeTransformer } from "~/transformers/auditLogs/storageShapeTransformer.js";
import { makeFakeBaseContext } from "../fakeContext.ts";

// Record as it looks AFTER coreFieldsTransformer + dataFieldsTransformer have run
const INTERMEDIATE_RECORD = {
    PK: "T#root#L#en-US#CMS#CME#wby-aco-686f7147c0aada0002aa5d0e",
    SK: "L",
    tenant: "root",
    entryId: "wby-aco-686f7147c0aada0002aa5d0e",
    modelId: "acoSearchRecord-auditlogs",
    // set by coreFieldsTransformer
    id: "507f1f77bcf86cd799439011",
    createdBy: { id: "user-1", displayName: "Alice", type: "admin" },
    createdOn: "2025-07-10T07:52:39.413Z",
    expiresAt: "2025-09-08T07:52:39.413Z",
    // set by dataFieldsTransformer
    app: "SECURITY",
    action: "UPDATE",
    message: "User updated",
    entity: "USER",
    entityId: "wby-aco-686f7147c0aada0002aa5d0e",
    tags: [],
    content: '{"compression":"gzip","value":"H4sI..."}'
};

describe("storageShapeTransformer", () => {
    it("sets correct PK", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).PK).toBe("T#root#AUDIT_LOG");
    });

    it("sets SK to the mdbid", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).SK).toBe("507f1f77bcf86cd799439011");
    });

    it("sets TYPE to auditLog.log", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).TYPE).toBe("auditLog.log");
    });

    it("sets GSI_TENANT", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI_TENANT).toBe("root");
    });

    it("sets GSI1 (app)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect(r.GSI1_PK).toBe("T#root#AUDIT_LOG#APP#SECURITY");
        expect(r.GSI1_SK).toBe(new Date("2025-07-10T07:52:39.413Z").getTime());
    });

    it("sets GSI2 (app + createdBy)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI2_PK).toBe(
            "T#root#AUDIT_LOG#APP#SECURITY#CREATEDBY#user-1"
        );
    });

    it("sets GSI3 (app + entity)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI3_PK).toBe(
            "T#root#AUDIT_LOG#APP#SECURITY#ENTITY#USER"
        );
    });

    it("sets GSI4 (entityId)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI4_PK).toBe(
            "T#root#AUDIT_LOG#ENTITY_ID#wby-aco-686f7147c0aada0002aa5d0e"
        );
    });

    it("sets GSI5 (app + entity + action + createdBy)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI5_PK).toBe(
            "T#root#AUDIT_LOG#APP#SECURITY#ENTITY#USER#ACTION#UPDATE#CREATEDBY#user-1"
        );
    });

    it("sets GSI6 (app + entity + action)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI6_PK).toBe(
            "T#root#AUDIT_LOG#APP#SECURITY#ENTITY#USER#ACTION#UPDATE"
        );
    });

    it("sets GSI7 (app + entity + createdBy)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI7_PK).toBe(
            "T#root#AUDIT_LOG#APP#SECURITY#ENTITY#USER#CREATEDBY#user-1"
        );
    });

    it("sets GSI8 (createdBy)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI8_PK).toBe(
            "T#root#AUDIT_LOG#CREATEDBY#user-1"
        );
    });

    it("sets GSI9 (createdOn)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect(r.GSI9_PK).toBe("T#root#AUDIT_LOG#CREATED_ON");
        expect(r.GSI9_SK).toBe(new Date("2025-07-10T07:52:39.413Z").getTime());
    });

    it("sets data envelope with all domain fields", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect(r.data).toEqual({
            id: "507f1f77bcf86cd799439011",
            tenant: "root",
            createdBy: { id: "user-1", displayName: "Alice", type: "admin" },
            createdOn: "2025-07-10T07:52:39.413Z",
            app: "SECURITY",
            action: "UPDATE",
            message: "User updated",
            entity: "USER",
            entityId: "wby-aco-686f7147c0aada0002aa5d0e",
            tags: [],
            expiresAt: "2025-09-08T07:52:39.413Z",
            content: '{"compression":"gzip","value":"H4sI..."}'
        });
    });

    it("sets top-level expiresAt as Unix seconds TTL", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect(r.expiresAt).toBe(Math.floor(new Date("2025-09-08T07:52:39.413Z").getTime() / 1000));
    });
});

describe("storageShapeTransformer — guard", () => {
    it("returns early without ctx.replace when createdBy is missing", () => {
        const record = { ...INTERMEDIATE_RECORD, createdBy: undefined };
        const ctx = makeFakeBaseContext(record);
        const originalRecord = ctx.record;
        storageShapeTransformer(ctx);
        expect(ctx.record).toBe(originalRecord);
        expect((ctx.record as Record<string, unknown>).TYPE).not.toBe("auditLog.log");
    });

    it("returns early without ctx.replace when createdOn is missing", () => {
        const record = { ...INTERMEDIATE_RECORD, createdOn: undefined };
        const ctx = makeFakeBaseContext(record);
        const originalRecord = ctx.record;
        storageShapeTransformer(ctx);
        expect(ctx.record).toBe(originalRecord);
        expect((ctx.record as Record<string, unknown>).TYPE).not.toBe("auditLog.log");
    });
});
