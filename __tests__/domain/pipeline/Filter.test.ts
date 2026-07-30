import { describe, it, expect } from "vitest";
import { createFilter, type Filter } from "~/domain/pipeline/index.js";

interface TestRecord {
    type: string;
    deleted?: boolean;
}

describe("createFilter", () => {
    it("wraps a predicate into a branded Filter", () => {
        const isFoo = createFilter<TestRecord>(record => record.type === "foo");

        expect(isFoo.kind).toBe("filter");
        expect(typeof isFoo.check).toBe("function");
        expect(isFoo.check({ type: "foo" })).toBe(true);
        expect(isFoo.check({ type: "bar" })).toBe(false);
    });

    it("preserves the predicate's logic exactly", () => {
        const notDeleted = createFilter<TestRecord>(record => !record.deleted);

        expect(notDeleted.check({ type: "x", deleted: false })).toBe(true);
        expect(notDeleted.check({ type: "x", deleted: true })).toBe(false);
        expect(notDeleted.check({ type: "x" })).toBe(true);
    });

    it("returns an object compatible with Filter<T>", () => {
        const filter: Filter<TestRecord> = createFilter<TestRecord>(
            record => record.type === "foo"
        );

        expect(filter).toBeDefined();
    });
});
