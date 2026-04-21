import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fromEnv } from "~/utils/fromEnv.ts";

const TEST_VAR = "__TEST_FROM_ENV_VAR__";

describe("fromEnv", () => {
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
});
