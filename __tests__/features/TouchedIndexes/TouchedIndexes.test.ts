import { describe, expect, it } from "vitest";
import { Container } from "@webiny/di";
import { TouchedIndexesFeature } from "~/features/TouchedIndexes/feature.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";

function createContainer(): Container {
    const container = new Container();
    TouchedIndexesFeature.register(container);
    return container;
}

describe("TouchedIndexes", () => {
    it("has() returns false for an unrecorded index", () => {
        const touched = createContainer().resolve(TouchedIndexes);
        expect(touched.has("idx-a")).toBe(false);
    });

    it("has() returns true after record()", () => {
        const touched = createContainer().resolve(TouchedIndexes);
        touched.record("idx-a", "1s");
        expect(touched.has("idx-a")).toBe(true);
    });

    it("all() returns the recorded items as an array", () => {
        const touched = createContainer().resolve(TouchedIndexes);
        touched.record("idx-a", "1s");
        touched.record("idx-b", "5s");
        expect(touched.all()).toEqual([
            { indexName: "idx-a", originalRefresh: "1s" },
            { indexName: "idx-b", originalRefresh: "5s" }
        ]);
    });

    it("record() for an existing index overwrites the originalRefresh", () => {
        const touched = createContainer().resolve(TouchedIndexes);
        touched.record("idx-a", "1s");
        touched.record("idx-a", "5s");
        expect(touched.all()).toEqual([{ indexName: "idx-a", originalRefresh: "5s" }]);
    });

    it("is a singleton — same instance across resolve() calls", () => {
        const container = createContainer();
        const a = container.resolve(TouchedIndexes);
        const b = container.resolve(TouchedIndexes);
        expect(a).toBe(b);
    });
});
