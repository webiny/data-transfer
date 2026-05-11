import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fromEnv, numberFromEnv } from "~/utils/fromEnv.ts";

const TEST_VAR = "__TEST_FROM_ENV_VAR__";

function withEnvCleanup(): void {
    let originalValue: string | undefined;
    beforeEach(() => {
        originalValue = process.env[TEST_VAR];
        delete process.env[TEST_VAR];
    });
    afterEach(() => {
        if (originalValue === undefined) {
            delete process.env[TEST_VAR];
            return;
        }
        process.env[TEST_VAR] = originalValue;
    });
}

describe("fromEnv", () => {
    withEnvCleanup();

    it("returns the env var value when set", () => {
        process.env[TEST_VAR] = "hello";
        expect(fromEnv(TEST_VAR)).toBe("hello");
    });

    it("returns the env var value over the default when both are provided", () => {
        process.env[TEST_VAR] = "actual";
        expect(fromEnv(TEST_VAR, "fallback")).toBe("actual");
    });

    it("returns the default when the env var is absent", () => {
        expect(fromEnv(TEST_VAR, "fallback")).toBe("fallback");
    });

    it("returns the default when the env var is an empty string", () => {
        process.env[TEST_VAR] = "";
        expect(fromEnv(TEST_VAR, "fallback")).toBe("fallback");
    });

    it("throws a helpful error when the env var is absent and no default is provided", () => {
        expect(() => fromEnv(TEST_VAR)).toThrow(/__TEST_FROM_ENV_VAR__/);
    });

    it("throws when the env var is an empty string and no default is provided", () => {
        process.env[TEST_VAR] = "";
        expect(() => fromEnv(TEST_VAR)).toThrow(/__TEST_FROM_ENV_VAR__/);
    });

    it("returns null when defaultValue is null and the env var is absent", () => {
        expect(fromEnv(TEST_VAR, null)).toBeNull();
    });

    it("returns null when defaultValue is null and the env var is empty", () => {
        process.env[TEST_VAR] = "";
        expect(fromEnv(TEST_VAR, null)).toBeNull();
    });

    it("returns the env var value when set, even with null default", () => {
        process.env[TEST_VAR] = "present";
        expect(fromEnv(TEST_VAR, null)).toBe("present");
    });
});

describe("numberFromEnv", () => {
    withEnvCleanup();

    it("parses and returns an integer env var", () => {
        process.env[TEST_VAR] = "42";
        expect(numberFromEnv(TEST_VAR)).toBe(42);
    });

    it("parses a float", () => {
        process.env[TEST_VAR] = "3.14";
        expect(numberFromEnv(TEST_VAR)).toBe(3.14);
    });

    it("parses a negative number", () => {
        process.env[TEST_VAR] = "-7";
        expect(numberFromEnv(TEST_VAR)).toBe(-7);
    });

    it("returns the env value over the default when both are provided", () => {
        process.env[TEST_VAR] = "10";
        expect(numberFromEnv(TEST_VAR, 99)).toBe(10);
    });

    it("returns the default when the env var is absent", () => {
        expect(numberFromEnv(TEST_VAR, 4)).toBe(4);
    });

    it("returns the default when the env var is an empty string", () => {
        process.env[TEST_VAR] = "";
        expect(numberFromEnv(TEST_VAR, 4)).toBe(4);
    });

    it("throws when the value is set but not parseable as a number", () => {
        process.env[TEST_VAR] = "four";
        expect(() => numberFromEnv(TEST_VAR, 4)).toThrow(/not a valid number.*"four"/);
    });

    it("throws when absent and no default is provided", () => {
        expect(() => numberFromEnv(TEST_VAR)).toThrow(/__TEST_FROM_ENV_VAR__/);
    });
});
