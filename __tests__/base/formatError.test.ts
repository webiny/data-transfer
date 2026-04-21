import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { formatError } from "~/base/index.ts";

describe("formatError", () => {
    const originalDebug = process.env.DEBUG;

    beforeEach(() => {
        delete process.env.DEBUG;
    });

    afterEach(() => {
        if (originalDebug === undefined) {
            delete process.env.DEBUG;
        } else {
            process.env.DEBUG = originalDebug;
        }
    });

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
        expect(output).toContain("DEBUG=1");
    });

    it("uses <root> for empty path in ZodError", () => {
        const zodLike = {
            name: "ZodError",
            issues: [{ path: [], message: "Expected object, got null" }]
        };

        expect(formatError(zodLike)).toContain("<root>: Expected object, got null");
    });

    it("formats a regular Error as message + DEBUG hint", () => {
        const err = new Error("Something went wrong");

        const output = formatError(err);

        expect(output).toContain("Something went wrong");
        expect(output).toContain("DEBUG=1");
    });

    it("includes stack trace when DEBUG is set", () => {
        process.env.DEBUG = "1";
        const err = new Error("boom");

        const output = formatError(err);

        expect(output).toContain("boom");
        expect(output).toContain("formatError.test.ts");
        expect(output).not.toContain("DEBUG=1 to see");
    });

    it("falls back to String() for non-Error values", () => {
        expect(formatError("plain string")).toBe("plain string");
        expect(formatError(42)).toBe("42");
        expect(formatError({ arbitrary: "object" })).toBe("[object Object]");
    });
});
