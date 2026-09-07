import { describe, it, expect } from "vitest";
import {
    parseSegmentsFilter,
    resolveSegmentsToRun
} from "../../src/commands/transfer/segmentsFilter.ts";

describe("parseSegmentsFilter", () => {
    it("parses a comma-separated list", () => {
        expect(parseSegmentsFilter("1,3")).toEqual([1, 3]);
    });

    it("tolerates whitespace around values", () => {
        expect(parseSegmentsFilter(" 0 , 2 , 5 ")).toEqual([0, 2, 5]);
    });

    it("deduplicates and sorts ascending", () => {
        expect(parseSegmentsFilter("3,1,3,0")).toEqual([0, 1, 3]);
    });

    it("accepts zero as a valid segment index", () => {
        expect(parseSegmentsFilter("0")).toEqual([0]);
    });

    it("rejects empty input", () => {
        expect(() => parseSegmentsFilter("")).toThrow(/at least one index/);
        expect(() => parseSegmentsFilter(",,")).toThrow(/at least one index/);
    });

    it("rejects non-integer values", () => {
        expect(() => parseSegmentsFilter("1,abc")).toThrow(/non-negative integers/);
    });

    it("rejects negative values", () => {
        expect(() => parseSegmentsFilter("1,-2")).toThrow(/non-negative integers/);
    });

    it("rejects fractional values", () => {
        expect(() => parseSegmentsFilter("1.5")).toThrow(/non-negative integers/);
    });
});

describe("resolveSegmentsToRun", () => {
    it("returns all indices when no filter is provided", () => {
        expect(resolveSegmentsToRun(4)).toEqual([0, 1, 2, 3]);
    });

    it("returns a single-element range when totalSegments is 1", () => {
        expect(resolveSegmentsToRun(1)).toEqual([0]);
    });

    it("returns the filter unchanged when all indices are in range", () => {
        expect(resolveSegmentsToRun(4, [1, 3])).toEqual([1, 3]);
    });

    it("throws if any filter value exceeds totalSegments - 1", () => {
        expect(() => resolveSegmentsToRun(4, [1, 5])).toThrow(
            /out-of-range values \[5\]; valid range for this config is 0..3/
        );
    });

    it("throws listing every out-of-range value", () => {
        expect(() => resolveSegmentsToRun(2, [0, 2, 3])).toThrow(/\[2, 3\]/);
    });
});
