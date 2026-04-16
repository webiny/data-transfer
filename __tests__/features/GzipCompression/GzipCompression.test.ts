import { describe, it, expect, beforeAll } from "vitest";
import { Container } from "@webiny/di";
import {
    GzipCompression,
    GzipCompressionFeature
} from "../../../src/features/GzipCompression/index.ts";

describe("GzipCompression", () => {
    let gzip: GzipCompression.Interface;

    beforeAll(() => {
        const container = new Container();
        GzipCompressionFeature.register(container);
        gzip = container.resolve(GzipCompression);
    });

    describe("compress and decompress", () => {
        it("should compress and decompress a string", async () => {
            const compressed = await gzip.compress("hello world");
            expect(compressed.compression).toBe("gzip");
            expect(typeof compressed.value).toBe("string");

            const decompressed = await gzip.decompress<string>(compressed);
            expect(decompressed).toBe("hello world");
        });

        it("should compress and decompress an object", async () => {
            const data = { modelId: "category", values: { title: "Test" }, count: 42 };
            const compressed = await gzip.compress(data);

            const decompressed = await gzip.decompress<typeof data>(compressed);
            expect(decompressed).toEqual(data);
        });

        it("should compress and decompress an array", async () => {
            const data = [1, 2, 3, "a", "b"];
            const compressed = await gzip.compress(data);

            const decompressed = await gzip.decompress<typeof data>(compressed);
            expect(decompressed).toEqual(data);
        });

        it("should compress and decompress null", async () => {
            const compressed = await gzip.compress(null);
            const decompressed = await gzip.decompress(compressed);
            expect(decompressed).toBeNull();
        });
    });

    describe("canDecompress", () => {
        it("should return true for gzip compressed data", () => {
            expect(gzip.canDecompress({ compression: "gzip", value: "abc" })).toBe(true);
        });

        it("should return true for GZIP (case insensitive)", () => {
            expect(gzip.canDecompress({ compression: "GZIP", value: "abc" })).toBe(true);
        });

        it("should return false for non-gzip compression", () => {
            expect(gzip.canDecompress({ compression: "jsonpack", value: "abc" })).toBe(false);
        });

        it("should return false for null", () => {
            expect(gzip.canDecompress(null)).toBe(false);
        });

        it("should return false for undefined", () => {
            expect(gzip.canDecompress(undefined)).toBe(false);
        });

        it("should return false for string", () => {
            expect(gzip.canDecompress("not an object")).toBe(false);
        });

        it("should return false for object without compression", () => {
            expect(gzip.canDecompress({ value: "abc" })).toBe(false);
        });
    });

    describe("decompress error handling", () => {
        it("should return null for invalid gzip data", async () => {
            const result = await gzip.decompress({
                compression: "gzip",
                value: "not-valid-base64-gzip"
            });
            expect(result).toBeNull();
        });

        it("should return null for empty value", async () => {
            const result = await gzip.decompress({ compression: "gzip", value: "" });
            expect(result).toBeNull();
        });

        it("should return null for null input", async () => {
            const result = await gzip.decompress(null as any);
            expect(result).toBeNull();
        });
    });

    describe("DI registration", () => {
        it("should resolve from container", () => {
            const container = new Container();
            GzipCompressionFeature.register(container);

            const compression = container.resolve(GzipCompression);
            expect(compression).toBeDefined();
        });
    });
});
