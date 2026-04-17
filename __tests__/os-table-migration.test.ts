import { describe, it, expect } from "vitest";
import { writeFile } from "fs/promises";
import { join } from "path";
import { table } from "./fixtures/es-table.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { OsRecordDecompressor } from "~/features/OsRecordDecompressor/index.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createOsContainer } from "./containers/index.ts";

describe("OS Table Migration", () => {
    it("should migrate es-table records and output readable JSON", async () => {
        const container = createOsContainer();
        const runner = container.resolve(PipelineRunner);
        const presetLoader = container.resolve(PresetLoader);
        const decompressor = container.resolve(OsRecordDecompressor);

        const preset = await presetLoader.load("v5-to-v6-os");
        preset.configure(runner);

        function stripLocaleFromIndex(index: string, locale: string): string {
            return index.replace(`-${locale.toLowerCase()}-`, "-");
        }

        const migratedRecords: Record<string, unknown>[] = [];
        let skippedCount = 0;

        for (const record of table) {
            const decompressed = await decompressor.decompress(record as any);
            if (!decompressed) {
                skippedCount++;
                continue;
            }

            const commands = await runner.processRecord(decompressed.record as BaseRecord);

            for (const put of commands.get<PutRecord>(PutRecord.key)) {
                const rec = put.record as any;
                const index = stripLocaleFromIndex(
                    decompressed.metadata.index,
                    decompressed.locale
                );

                migratedRecords.push({
                    PK: rec.PK,
                    SK: rec.SK,
                    data: rec.data,
                    index,
                    TYPE: rec.TYPE,
                    GSI_TENANT: rec.GSI_TENANT,
                    _et: "CmsEntriesElasticsearch",
                    _ct: decompressed.metadata._ct,
                    _md: decompressed.metadata._md
                });
            }
        }

        const outputPath = join(__dirname, "fixtures/os-table-migrated.json");
        await writeFile(outputPath, JSON.stringify(migratedRecords, null, 2));

        expect(migratedRecords.length).toBeGreaterThan(0);
        expect(skippedCount).toBeGreaterThan(0);

        for (const record of migratedRecords as any[]) {
            expect(record.PK).toBeDefined();
            expect(record.SK).toBeDefined();
            expect(record.TYPE).toBeDefined();
            expect(record.GSI_TENANT).toBeDefined();
            expect(record._et).toBe("CmsEntriesElasticsearch");
            expect(record._ct).toBeDefined();
            expect(record._md).toBeDefined();
            expect(record.index).toBeDefined();
            expect(record.index).not.toContain("en-us");
            expect(record.PK).not.toContain("#L#en-US#");

            const data = record.data as Record<string, unknown>;
            expect(data.locale).toBeUndefined();
            expect(data.webinyVersion).toBeUndefined();
        }

        console.log(
            `Migrated ${migratedRecords.length} OS records from ${table.length} input records (${skippedCount} skipped)`
        );
    });
});
