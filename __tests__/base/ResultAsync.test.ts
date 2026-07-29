import { describe, it, expect } from "vitest";
import { ResultAsync } from "~/base/ResultAsync.js";
import { Result } from "~/base/Result.js";

describe("ResultAsync", () => {
    describe("from", () => {
        it("wraps a Promise<Result>", async () => {
            const r = ResultAsync.from(() => Promise.resolve(Result.ok(1)));
            const result = await r.unwrap();
            expect(result.value).toBe(1);
        });
    });

    describe("ok", () => {
        it("wraps a successful value", async () => {
            const result = await ResultAsync.ok(42).unwrap();
            expect(result.isOk()).toBe(true);
            expect(result.value).toBe(42);
        });
    });

    describe("fail", () => {
        it("wraps a failure", async () => {
            const result = await ResultAsync.fail("oops").unwrap();
            expect(result.isFail()).toBe(true);
            expect(result.error).toBe("oops");
        });
    });

    describe("mapAsync", () => {
        it("transforms the value on success", async () => {
            const result = await ResultAsync.ok(3)
                .mapAsync(v => v * 2)
                .unwrap();
            expect(result.value).toBe(6);
        });

        it("supports async transformation", async () => {
            const result = await ResultAsync.ok(3)
                .mapAsync(async v => v + 1)
                .unwrap();
            expect(result.value).toBe(4);
        });

        it("passes through error on failure", async () => {
            const result = await ResultAsync.fail("e")
                .mapAsync((v: never) => v)
                .unwrap();
            expect(result.error).toBe("e");
        });
    });

    describe("mapErrorAsync", () => {
        it("transforms the error on failure", async () => {
            const result = await ResultAsync.fail("raw")
                .mapErrorAsync(e => `wrapped:${e}`)
                .unwrap();
            expect(result.error).toBe("wrapped:raw");
        });

        it("passes through value on success", async () => {
            const result = await ResultAsync.ok(7)
                .mapErrorAsync(() => "x")
                .unwrap();
            expect(result.value).toBe(7);
        });
    });

    describe("flatMapAsync", () => {
        it("chains on success", async () => {
            const result = await ResultAsync.ok(5)
                .flatMapAsync(v => ResultAsync.ok(v + 1))
                .unwrap();
            expect(result.value).toBe(6);
        });

        it("short-circuits on failure", async () => {
            const result = await ResultAsync.fail("e")
                .flatMapAsync(() => ResultAsync.ok(99))
                .unwrap();
            expect(result.error).toBe("e");
        });
    });

    describe("match", () => {
        it("calls ok handler on success", async () => {
            const out = await ResultAsync.ok("hi").match({
                ok: v => `ok:${v}`,
                fail: () => "fail"
            });
            expect(out).toBe("ok:hi");
        });

        it("calls fail handler on failure", async () => {
            const out = await ResultAsync.fail("boom").match({
                ok: () => "ok",
                fail: e => `fail:${e}`
            });
            expect(out).toBe("fail:boom");
        });
    });
});
