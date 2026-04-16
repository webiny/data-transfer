import { describe, it, expect } from "vitest";
import { writeFile } from "fs/promises";
import { join } from "path";
import { table } from "./fixtures/es-table.ts";
import { decompressOsRecord } from "../src/opensearch/decompress-record.ts";
import { isTransformedRecord } from "../src/utils/record-guards.ts";
import { MigrationRunner } from "../src/core/runner.ts";
import { MigrationConfig, PutRecordCommand } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { loadPreset } from "../src/core/preset-loader.ts";
import { GzipCompression } from "../src/utils/gzip-compression.ts";
import { stripLocaleFromIndex } from "../src/opensearch/decompress-record.ts";

const gzip = new GzipCompression();

describe("OS Table Migration", () => {
    it("should migrate es-table records and output readable JSON", async () => {
        const database = new MockDatabaseClient();
        const modelProvider = new ModelProvider(database, "source-table");

        const config: MigrationConfig = {
            sourcePrimaryTable: "source-table",
            targetPrimaryTable: "target-os-table",
            sourceFmBucket: "",
            targetFmBucket: "",
            modelProvider
        };

        const preset = await loadPreset("v5-to-v6-os");
        const runner = new MigrationRunner(config, database);
        preset.configure(runner, config, database);

        const migratedRecords: Record<string, unknown>[] = [];
        let skippedCount = 0;

        for (const record of table) {
            const decompressed = await decompressOsRecord(record as any);
            if (!decompressed) {
                skippedCount++;
                continue;
            }

            const locale = (decompressed.record.locale as string) || "en-US";
            const commands = await runner.processRecord(decompressed.record);

            for (const cmd of commands) {
                if (cmd.type === "PUT_RECORD") {
                    const rec = (cmd as PutRecordCommand).record;
                    if (!isTransformedRecord(rec)) {
                        continue;
                    }

                    const index = stripLocaleFromIndex(decompressed.metadata.index, locale);

                    // Build the OS record shape but with data decompressed for readability
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
        }

        // Write output
        const outputPath = join(__dirname, "fixtures/os-table-migrated.json");
        await writeFile(outputPath, JSON.stringify(migratedRecords, null, 2));

        // Sanity checks
        expect(migratedRecords.length).toBeGreaterThan(0);
        expect(skippedCount).toBeGreaterThan(0); // Pages should be skipped

        for (const record of migratedRecords) {
            // Must have correct shape
            expect(record.PK).toBeDefined();
            expect(record.SK).toBeDefined();
            expect(record.TYPE).toBeDefined();
            expect(record.GSI_TENANT).toBeDefined();
            expect(record._et).toBe("CmsEntriesElasticsearch");
            expect(record._ct).toBeDefined();
            expect(record._md).toBeDefined();
            expect(record.index).toBeDefined();

            // Index should not contain locale
            expect(record.index).not.toContain("en-us");

            // PK should not contain locale
            expect(record.PK).not.toContain("#L#en-US#");

            // Data should not contain locale field
            const data = record.data as Record<string, unknown>;
            expect(data.locale).toBeUndefined();

            // Data should not contain webinyVersion
            expect(data.webinyVersion).toBeUndefined();
        }

        console.log(
            `Migrated ${migratedRecords.length} OS records from ${table.length} input records (${skippedCount} skipped)`
        );
        console.log(`Output written to ${outputPath}`);
    });
});
