import { describe, it, expect } from "vitest";
import {
    byType,
    byTypePrefix,
    isCmsModel,
    isCmsEntry,
    isFmFile,
    isFlpRecord,
    isBuiltInSecurityRole,
    isSecurityTeam
} from "../../../src/domain/transform/filters.ts";

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
            expect(isCms({ TYPE: "cms.entry" })).toBe(true);
            expect(isCms({ TYPE: "cms.model" })).toBe(true);
            expect(isCms({ TYPE: "security.team" })).toBe(false);
        });

        it("should handle missing TYPE gracefully", () => {
            const isCms = byTypePrefix("cms.");
            expect(isCms({})).toBe(false);
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
            expect(isCmsEntry({ TYPE: "cms.entry" })).toBe(true);
            expect(isCmsEntry({ TYPE: "cms.entry.latest" })).toBe(true);
            expect(isCmsEntry({ TYPE: "cms.model" })).toBe(false);
        });
    });

    describe("isFmFile", () => {
        it("should match by top-level modelId", () => {
            expect(isFmFile({ modelId: "fmFile" })).toBe(true);
            expect(isFmFile({ modelId: "wbyFmFile" })).toBe(true);
        });

        it("should match by nested data.modelId", () => {
            expect(isFmFile({ data: { modelId: "fmFile" } })).toBe(true);
        });

        it("should reject non-FM records", () => {
            expect(isFmFile({ modelId: "other" })).toBe(false);
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
});
