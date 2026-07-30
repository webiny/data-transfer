import { describe, it, expect } from "vitest";
import { BaseError } from "~/base/BaseError.js";

class TestError extends BaseError<{ field: string }> {
    public readonly code = "TEST_ERROR";

    public constructor(message: string, field: string) {
        super({ message, data: { field } });
    }
}

class VoidTestError extends BaseError {
    public readonly code = "VOID_ERROR";

    public constructor(message: string, stack?: string) {
        super({ message }, { stack });
    }
}

describe("BaseError", () => {
    it("sets message from input", () => {
        const err = new TestError("something broke", "name");
        expect(err.message).toBe("something broke");
    });

    it("sets data from input", () => {
        const err = new TestError("oops", "email");
        expect(err.data).toEqual({ field: "email" });
    });

    it("exposes code on the instance", () => {
        const err = new TestError("x", "y");
        expect(err.code).toBe("TEST_ERROR");
    });

    it("is an instance of Error", () => {
        const err = new TestError("x", "y");
        expect(err).toBeInstanceOf(Error);
    });

    it("stores custom stack when provided", () => {
        const err = new VoidTestError("test", "custom stack");
        expect(err.stack).toBe("custom stack");
    });

    it("data is undefined for void data type", () => {
        const err = new VoidTestError("no data");
        expect(err.data).toBeUndefined();
    });
});
