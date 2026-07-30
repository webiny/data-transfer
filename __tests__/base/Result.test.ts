import { describe, it, expect, vi } from "vitest";
import { Result } from "~/base/Result.js";

describe("Result", () => {
    describe("ok", () => {
        it("creates a successful result with a value", () => {
            const r = Result.ok(42);
            expect(r.isOk()).toBe(true);
            expect(r.isFail()).toBe(false);
            expect(r.value).toBe(42);
        });

        it("creates a successful result with no value", () => {
            const r = Result.ok();
            expect(r.isOk()).toBe(true);
            expect(r.value).toBeUndefined();
        });
    });

    describe("fail", () => {
        it("creates a failed result with an error", () => {
            const r = Result.fail("oops");
            expect(r.isFail()).toBe(true);
            expect(r.isOk()).toBe(false);
            expect(r.error).toBe("oops");
        });
    });

    describe("value getter", () => {
        it("throws when accessed on a failed result", () => {
            const r = Result.fail("err");
            expect(() => r.value).toThrow("Tried to get value from a failed Result.");
        });
    });

    describe("error getter", () => {
        it("throws when accessed on a successful result", () => {
            const r = Result.ok(1);
            expect(() => r.error).toThrow("Tried to get error from a successful Result.");
        });
    });

    describe("map", () => {
        it("transforms the value on success", () => {
            const r = Result.ok(2).map(v => v * 3);
            expect(r.value).toBe(6);
        });

        it("passes through the error on failure", () => {
            const r = Result.fail<string>("e").map((v: never) => v);
            expect(r.error).toBe("e");
        });
    });

    describe("mapError", () => {
        it("transforms the error on failure", () => {
            const r = Result.fail("raw").mapError(e => `wrapped:${e}`);
            expect(r.error).toBe("wrapped:raw");
        });

        it("passes through the value on success", () => {
            const r = Result.ok(7).mapError(() => "x");
            expect(r.value).toBe(7);
        });
    });

    describe("flatMap", () => {
        it("chains a new Result on success", () => {
            const r = Result.ok(5).flatMap(v => Result.ok(v + 1));
            expect(r.value).toBe(6);
        });

        it("short-circuits on failure", () => {
            const fn = vi.fn();
            const r = Result.fail<string>("e").flatMap(fn);
            expect(fn).not.toHaveBeenCalled();
            expect(r.error).toBe("e");
        });
    });

    describe("match", () => {
        it("calls ok handler on success", () => {
            const out = Result.ok("hi").match({
                ok: v => `ok:${v}`,
                fail: () => "fail"
            });
            expect(out).toBe("ok:hi");
        });

        it("calls fail handler on failure", () => {
            const out = Result.fail("boom").match({
                ok: () => "ok",
                fail: e => `fail:${e}`
            });
            expect(out).toBe("fail:boom");
        });
    });
});
