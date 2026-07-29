import { describe, it, expect } from "vitest";
import { formatError } from "~/base/index.js";

describe("formatError", () => {
    it("formats ZodError-like values as a per-issue list", () => {
        const zodLike = {
            name: "ZodError",
            issues: [
                { path: ["source", "region"], message: "Required" },
                { path: ["pipeline", "segments"], message: "Expected number, got string" }
            ]
        };

        const output = formatError(zodLike);

        expect(output).toContain("Config validation failed:");
        expect(output).toContain("source.region: Required");
        expect(output).toContain("pipeline.segments: Expected number, got string");
        expect(output).toContain("logLevel");
    });

    it("uses <root> for empty path in ZodError", () => {
        const zodLike = {
            name: "ZodError",
            issues: [{ path: [], message: "Expected object, got null" }]
        };

        expect(formatError(zodLike)).toContain("<root>: Expected object, got null");
    });

    it("formats a regular Error as message + hint", () => {
        const err = new Error("Something went wrong");

        const output = formatError(err);

        expect(output).toContain("Something went wrong");
        expect(output).toContain("logLevel");
    });

    it("includes stack trace when verbose=true", () => {
        const err = new Error("boom");

        const output = formatError(err, true);

        expect(output).toContain("boom");
        expect(output).toContain("formatError.test.ts");
        expect(output).not.toContain("logLevel");
    });

    it("omits stack trace when verbose=false (default)", () => {
        const err = new Error("boom");

        const output = formatError(err, false);

        expect(output).not.toContain("formatError.test.ts");
        expect(output).toContain("logLevel");
    });

    it("falls back to String() for non-Error values", () => {
        expect(formatError("plain string")).toBe("plain string");
        expect(formatError(42)).toBe("42");
        expect(formatError({ arbitrary: "object" })).toBe("[object Object]");
    });

    it("returns generic message when ZodError has no issues", () => {
        const zodLike = { name: "ZodError", issues: [] };
        expect(formatError(zodLike)).toContain("Validation failed (no details).");
    });
});
