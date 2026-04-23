import { describe, it, expect } from "vitest";
import {
    byType,
    byTypePrefix,
    isCmsModel,
    isCmsEntry,
    isFmFile,
    isFlpRecord,
    isBuiltInSecurityRole,
    isSecurityTeam,
    isOsBackgroundTask,
    isOsMailerSettings
} from "../../../src/domain/transform/filters.ts";
import type { BaseRecord } from "../../../src/domain/transform/types/records.ts";

function makeRecord(overrides: Partial<BaseRecord> & Record<string, unknown>): BaseRecord {
    return {
        PK: "T#root#ITEM#1",
        SK: "A",
        _et: "TestEntity",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "",
        ...overrides
    };
}

describe("filters", () => {
    describe("byType", () => {
        it("should match records with exact TYPE", () => {
            const isFoo = byType("foo");
            expect(isFoo({ TYPE: "foo" })).toBe(true);
            expect(isFoo({ TYPE: "bar" })).toBe(false);
        });
    });

    describe("byTypePrefix", () => {
        it("should match records where TYPE starts with prefix", () => {
            const isCms = byTypePrefix("cms.");
            expect(isCms(makeRecord({ TYPE: "cms.entry" }))).toBe(true);
            expect(isCms(makeRecord({ TYPE: "cms.model" }))).toBe(true);
            expect(isCms(makeRecord({ TYPE: "security.team" }))).toBe(false);
        });

        it("should handle missing TYPE gracefully", () => {
            const isCms = byTypePrefix("cms.");
            expect(isCms(makeRecord({ TYPE: "" }))).toBe(false);
        });
    });

    describe("isCmsModel", () => {
        it("should match cms.model records", () => {
            expect(isCmsModel({ TYPE: "cms.model" })).toBe(true);
            expect(isCmsModel({ TYPE: "cms.entry" })).toBe(false);
        });
    });

    describe("isCmsEntry", () => {
        it("should match any cms.entry.* record", () => {
            expect(isCmsEntry(makeRecord({ TYPE: "cms.entry" }))).toBe(true);
            expect(isCmsEntry(makeRecord({ TYPE: "cms.entry.latest" }))).toBe(true);
            expect(isCmsEntry(makeRecord({ TYPE: "cms.model" }))).toBe(false);
        });
    });

    describe("isFmFile", () => {
        it("should match by top-level modelId", () => {
            expect(isFmFile(makeRecord({ modelId: "fmFile" }))).toBe(true);
            expect(isFmFile(makeRecord({ modelId: "wbyFmFile" }))).toBe(true);
        });

        it("should match by nested data.modelId", () => {
            expect(isFmFile(makeRecord({ data: { modelId: "fmFile" } }))).toBe(true);
        });

        it("should reject non-FM records", () => {
            expect(isFmFile(makeRecord({ modelId: "other" }))).toBe(false);
        });
    });

    describe("isFlpRecord", () => {
        it("should match records with #FLP# in PK", () => {
            expect(isFlpRecord({ PK: "T#root#FLP#123" })).toBe(true);
            expect(isFlpRecord({ PK: "T#root#CMS#CME" })).toBe(false);
        });
    });

    describe("isBuiltInSecurityRole", () => {
        it("should match full-access and anonymous roles", () => {
            expect(isBuiltInSecurityRole({ slug: "full-access" })).toBe(true);
            expect(isBuiltInSecurityRole({ slug: "anonymous" })).toBe(true);
            expect(isBuiltInSecurityRole({ slug: "custom" })).toBe(false);
        });

        it("should fall back to GSI1_SK", () => {
            expect(isBuiltInSecurityRole({ GSI1_SK: "full-access" })).toBe(true);
        });
    });

    describe("isSecurityTeam", () => {
        it("should match security.team records", () => {
            expect(isSecurityTeam({ TYPE: "security.team" })).toBe(true);
            expect(isSecurityTeam({ TYPE: "security.group" })).toBe(false);
        });
    });

    describe("isOsBackgroundTask", () => {
        it("matches webinyTask and webinyTaskLog by data.modelId", () => {
            expect(isOsBackgroundTask(makeRecord({ data: { modelId: "webinyTask" } }))).toBe(true);
            expect(isOsBackgroundTask(makeRecord({ data: { modelId: "webinyTaskLog" } }))).toBe(
                true
            );
        });

        it("rejects other modelIds", () => {
            expect(isOsBackgroundTask(makeRecord({ data: { modelId: "blogPost" } }))).toBe(false);
        });

        it("returns false when data is absent", () => {
            expect(isOsBackgroundTask(makeRecord({}))).toBe(false);
        });
    });

    describe("isOsMailerSettings", () => {
        it("matches mailerSettings by data.modelId", () => {
            expect(isOsMailerSettings(makeRecord({ data: { modelId: "mailerSettings" } }))).toBe(
                true
            );
        });

        it("rejects other modelIds", () => {
            expect(isOsMailerSettings(makeRecord({ data: { modelId: "blogPost" } }))).toBe(false);
        });

        it("returns false when data is absent", () => {
            expect(isOsMailerSettings(makeRecord({}))).toBe(false);
        });
    });
});
