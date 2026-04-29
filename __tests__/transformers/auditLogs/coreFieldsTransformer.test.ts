import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { coreFieldsTransformer } from "~/transformers/auditLogs/coreFieldsTransformer.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const FROZEN_NOW = new Date("2025-07-10T12:00:00.000Z").getTime();

const SOURCE_RECORD = {
    PK: "T#root#L#en-US#CMS#CME#wby-aco-686f7147c0aada0002aa5d0e",
    SK: "L",
    tenant: "root",
    entryId: "wby-aco-686f7147c0aada0002aa5d0e",
    modelId: "acoSearchRecord-auditlogs",
    revisionCreatedBy: {
        id: "58a2841f-9831-4b37-92e6-e04e40132db6",
        displayName: "Danny Goersdorf",
        type: "admin"
    },
    revisionCreatedOn: "2025-07-10T07:52:39.413Z"
};

describe("coreFieldsTransformer", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(FROZEN_NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("sets a fresh mdbid as id", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        coreFieldsTransformer(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(typeof record.id).toBe("string");
        expect((record.id as string).length).toBeGreaterThan(0);
        expect(record.id).not.toBe("wby-aco-686f7147c0aada0002aa5d0e#0001");
    });

    it("copies revisionCreatedBy to createdBy", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        coreFieldsTransformer(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.createdBy).toEqual({
            id: "58a2841f-9831-4b37-92e6-e04e40132db6",
            displayName: "Danny Goersdorf",
            type: "admin"
        });
    });

    it("copies revisionCreatedOn to createdOn", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        coreFieldsTransformer(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.createdOn).toBe("2025-07-10T07:52:39.413Z");
    });

    it("sets expiresAt to 60 days from now as ISO string", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        coreFieldsTransformer(ctx);
        const record = ctx.record as Record<string, unknown>;
        const expected = new Date(FROZEN_NOW + SIXTY_DAYS_MS).toISOString();
        expect(record.expiresAt).toBe(expected);
    });
});
