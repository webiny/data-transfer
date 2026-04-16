import { describe, it, expect, beforeEach } from "vitest";
import sharp from "sharp";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";

function makeV5FileRecord(
    overrides: {
        contentType?: string;
        key?: string;
        hasMeta?: boolean;
    } = {}
) {
    const values: Record<string, unknown> = {
        "number@size": 1234,
        "text@aliases": [],
        "text@key": overrides.key ?? "abc123/test-file.jpg",
        "text@name": "test-file.jpg",
        "text@tags": [],
        "text@type": overrides.contentType ?? "image/jpeg"
    };

    if (overrides.hasMeta !== false) {
        values["object@meta"] = { "boolean@private": false };
    }

    return {
        PK: "T#root#L#en-US#CMS#CME#abc123",
        SK: "L",
        TYPE: "cms.entry.l",
        modelId: "fmFile",
        locale: "en-US",
        tenant: "root",
        id: "abc123#0001",
        entryId: "abc123",
        values,
        version: 1,
        _ct: "2025-01-01T00:00:00.000Z",
        _et: "CmsEntries",
        _md: "2025-01-01T00:00:00.000Z"
    };
}

async function createTestImage(width = 100, height = 50): Promise<Buffer> {
    return sharp({
        create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } }
    })
        .jpeg()
        .toBuffer();
}

describe("Extract Image Metadata", () => {
    let database: MockDatabaseClient;
    let storage: MockStorageClient;
    let config: MigrationConfig;

    beforeEach(() => {
        database = new MockDatabaseClient();
        storage = new MockStorageClient();
        const modelProvider = new ModelProvider(database, "source-table");
        config = {
            sourcePrimaryTable: "source-table",
            targetPrimaryTable: "target-table",
            sourceFmBucket: "source-bucket",
            targetFmBucket: "target-bucket",
            modelProvider,
            sourceStorage: storage
        };
    });

    function findEntry(records: Record<string, unknown>[]) {
        const entry = records.find(r => r.TYPE === "cms.entry.l");
        expect(entry).toBeDefined();
        return (entry!.data as any).values;
    }

    it("should extract image dimensions for image files", async () => {
        const imageBuffer = await createTestImage(200, 150);
        storage.putFile("source-bucket", "abc123/test-file.jpg", imageBuffer);

        const record = makeV5FileRecord({ contentType: "image/jpeg" });
        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(record);
        await executeCommands(commands, { database, storage });

        const values = findEntry(database.batchPutRecords);

        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toBeDefined();

        const imageMetadata = values["object@metadata"]["object@image"];
        expect(imageMetadata["number@width"]).toBe(200);
        expect(imageMetadata["number@height"]).toBe(150);
        expect(imageMetadata["text@format"]).toBe("jpeg");
        expect(imageMetadata["number@orientation"]).toBeDefined();
    });

    it("should set empty metadata for non-image files", async () => {
        const record = makeV5FileRecord({ contentType: "application/pdf" });
        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(record);
        await executeCommands(commands, { database, storage });

        const values = findEntry(database.batchPutRecords);

        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
    });

    it("should fall back to empty metadata when file is missing from S3", async () => {
        // Don't put any file in mock storage
        const record = makeV5FileRecord({ contentType: "image/png" });
        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(record);
        await executeCommands(commands, { database, storage });

        const values = findEntry(database.batchPutRecords);

        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
    });

    it("should handle records without object@meta", async () => {
        const record = makeV5FileRecord({ contentType: "application/pdf", hasMeta: false });
        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(record);
        await executeCommands(commands, { database, storage });

        const values = findEntry(database.batchPutRecords);

        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
    });
});
