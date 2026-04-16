import { describe, it, expect } from "vitest";
import { decompressOsRecord, stripLocaleFromIndex } from "../src/opensearch/decompress-record.ts";
import { GzipCompression } from "../src/utils/gzip-compression.ts";

const gzip = new GzipCompression();

describe("decompressOsRecord", () => {
    it("should decompress a CmsEntriesElasticsearch record and derive TYPE from SK=L", async () => {
        const innerData = {
            PK: "T#root#L#en-US#CMS#CME#abc123",
            SK: "L",
            modelId: "category",
            status: "draft",
            values: { title: "Test" }
        };
        const compressed = await gzip.compress(innerData);

        const osRecord = {
            PK: "T#root#L#en-US#CMS#CME#abc123",
            SK: "L",
            data: compressed,
            index: "root-headless-cms-en-us-category",
            _et: "CmsEntriesElasticsearch",
            _ct: "2026-04-13T09:00:00.000Z",
            _md: "2026-04-13T09:00:00.000Z"
        };

        const result = await decompressOsRecord(osRecord);

        expect(result).not.toBeNull();
        expect(result!.record.TYPE).toBe("cms.entry.l");
        expect(result!.record.PK).toBe("T#root#L#en-US#CMS#CME#abc123");
        expect(result!.record.modelId).toBe("category");
        expect(result!.record.values).toEqual({ title: "Test" });
        expect(result!.metadata.index).toBe("root-headless-cms-en-us-category");
        expect(result!.metadata._ct).toBe("2026-04-13T09:00:00.000Z");
        expect(result!.metadata._md).toBe("2026-04-13T09:00:00.000Z");
    });

    it("should derive TYPE cms.entry.p from SK=P", async () => {
        const innerData = { PK: "T#root#L#en-US#CMS#CME#abc123", SK: "P", modelId: "category" };
        const compressed = await gzip.compress(innerData);

        const osRecord = {
            PK: "T#root#L#en-US#CMS#CME#abc123",
            SK: "P",
            data: compressed,
            index: "root-headless-cms-en-us-category",
            _et: "CmsEntriesElasticsearch",
            _ct: "2026-04-13T09:00:00.000Z",
            _md: "2026-04-13T09:00:00.000Z"
        };

        const result = await decompressOsRecord(osRecord);
        expect(result!.record.TYPE).toBe("cms.entry.p");
    });

    it("should return null for non-CmsEntriesElasticsearch records", async () => {
        const osRecord = {
            PK: "T#root#L#en-US#PB#P#abc123",
            SK: "L",
            data: { some: "data" },
            index: "root-en-us-page-builder",
            _et: "PbPagesEs",
            _ct: "2026-04-13T09:00:00.000Z",
            _md: "2026-04-13T09:00:00.000Z"
        };

        const result = await decompressOsRecord(osRecord);
        expect(result).toBeNull();
    });

    it("should return null for unexpected SK values", async () => {
        const innerData = {
            PK: "T#root#L#en-US#CMS#CME#abc123",
            SK: "REV#0001",
            modelId: "category"
        };
        const compressed = await gzip.compress(innerData);

        const osRecord = {
            PK: "T#root#L#en-US#CMS#CME#abc123",
            SK: "REV#0001",
            data: compressed,
            index: "root-headless-cms-en-us-category",
            _et: "CmsEntriesElasticsearch",
            _ct: "2026-04-13T09:00:00.000Z",
            _md: "2026-04-13T09:00:00.000Z"
        };

        const result = await decompressOsRecord(osRecord);
        expect(result).toBeNull();
    });

    it("should return null if decompression fails", async () => {
        const osRecord = {
            PK: "T#root#L#en-US#CMS#CME#abc123",
            SK: "L",
            data: { compression: "gzip", value: "not-valid-gzip" },
            index: "root-headless-cms-en-us-category",
            _et: "CmsEntriesElasticsearch",
            _ct: "2026-04-13T09:00:00.000Z",
            _md: "2026-04-13T09:00:00.000Z"
        };

        const result = await decompressOsRecord(osRecord);
        expect(result).toBeNull();
    });
});

describe("stripLocaleFromIndex", () => {
    it("should remove locale from cms index", () => {
        expect(stripLocaleFromIndex("root-headless-cms-en-us-category", "en-US")).toBe(
            "root-headless-cms-category"
        );
    });

    it("should remove locale from different position", () => {
        expect(stripLocaleFromIndex("root-en-us-page-builder", "en-US")).toBe("root-page-builder");
    });

    it("should handle de-DE locale", () => {
        expect(stripLocaleFromIndex("root-headless-cms-de-de-category", "de-DE")).toBe(
            "root-headless-cms-category"
        );
    });

    it("should return index unchanged if locale not found", () => {
        expect(stripLocaleFromIndex("root-headless-cms-category", "en-US")).toBe(
            "root-headless-cms-category"
        );
    });
});
