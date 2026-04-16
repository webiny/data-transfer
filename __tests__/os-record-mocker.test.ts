import { describe, it, expect } from "vitest";
import { generateOsRecords } from "./utils/os-record-mocker.ts";
import { decompressOsRecord } from "../src/opensearch/decompress-record.ts";

describe("generateOsRecords", () => {
    it("should generate L + P records for each CMS entry", async () => {
        const records = await generateOsRecords({ entries: 3 });

        expect(records).toHaveLength(6); // 3 entries * 2 (L + P)

        const latests = records.filter(r => r.SK === "L");
        const published = records.filter(r => r.SK === "P");
        expect(latests).toHaveLength(3);
        expect(published).toHaveLength(3);
    });

    it("should generate decompressable CMS records", async () => {
        const records = await generateOsRecords({ entries: 1 });

        const result = await decompressOsRecord(records[0]);
        expect(result).not.toBeNull();
        expect(result!.record.TYPE).toBe("cms.entry.l");
        expect(result!.record.modelId).toBeDefined();
        expect(result!.record.entryId).toBeDefined();
        expect(result!.record.locale).toBe("en-US");
        expect(result!.metadata.index).toContain("root-headless-cms-en-us");
    });

    it("should cycle through model IDs", async () => {
        const records = await generateOsRecords({
            entries: 6,
            modelIds: ["category", "article"]
        });

        const latests = records.filter(r => r.SK === "L");
        const modelIds = await Promise.all(
            latests.map(async r => {
                const d = await decompressOsRecord(r);
                return d!.record.modelId;
            })
        );

        expect(modelIds).toEqual([
            "category",
            "article",
            "category",
            "article",
            "category",
            "article"
        ]);
    });

    it("should generate FM file records", async () => {
        const records = await generateOsRecords({ entries: 0, files: 2 });

        expect(records).toHaveLength(2); // files only have L variant
        expect(records[0]._et).toBe("CmsEntriesElasticsearch");

        const result = await decompressOsRecord(records[0]);
        expect(result!.record.modelId).toBe("fmFile");
    });

    it("should generate page records that are skipped by decompressor", async () => {
        const records = await generateOsRecords({ entries: 0, pages: 2 });

        expect(records).toHaveLength(4); // 2 pages * 2 (L + P)
        expect(records[0]._et).toBe("PbPagesEs");

        const result = await decompressOsRecord(records[0]);
        expect(result).toBeNull(); // Pages are skipped
    });

    it("should generate mixed records", async () => {
        const records = await generateOsRecords({ entries: 5, files: 3, pages: 2 });

        const cms = records.filter(r => r._et === "CmsEntriesElasticsearch");
        const pages = records.filter(r => r._et === "PbPagesEs");

        expect(cms).toHaveLength(13); // 5*2 + 3
        expect(pages).toHaveLength(4); // 2*2
        expect(records).toHaveLength(17);
    });

    it("should support custom tenant and locale", async () => {
        const records = await generateOsRecords({
            entries: 1,
            tenant: "acme",
            locale: "de-DE"
        });

        expect(records[0].PK).toContain("T#acme#L#de-DE");
        expect(records[0].index).toContain("acme-headless-cms-de-de");

        const result = await decompressOsRecord(records[0]);
        expect(result!.record.tenant).toBe("acme");
        expect(result!.record.locale).toBe("de-DE");
    });

    it("should generate configurable amounts", async () => {
        const records = await generateOsRecords({ entries: 100 });
        expect(records).toHaveLength(200);

        // All should be valid CmsEntriesElasticsearch
        for (const record of records) {
            expect(record._et).toBe("CmsEntriesElasticsearch");
            expect(record.data.compression).toBe("gzip");
        }
    });
});
