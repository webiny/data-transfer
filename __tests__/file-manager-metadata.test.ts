import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { SourceS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { MockS3Client } from "./services/S3Client/MockS3Client.ts";

function makeV5FileRecord(
    overrides: {
        contentType?: string;
        key?: string;
        hasMeta?: boolean;
    } = {}
): any {
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

function setup() {
    const container = createDdbContainer();
    const runner = container.resolve(PipelineRunner);
    const executor = container.resolve(DdbCommandExecutor);
    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    const sourceS3 = container.resolve(SourceS3Client) as MockS3Client;
    v5ToV6Preset.configure(runner);
    return { runner, executor, targetDb, sourceS3 };
}

function findEntry(records: Record<string, unknown>[]) {
    const entry = records.find(r => r.TYPE === "cms.entry.l");
    expect(entry).toBeDefined();
    return (entry as any).data.values;
}

describe("Extract Image Metadata", () => {
    it("should extract image dimensions for image files", async () => {
        const { runner, executor, targetDb, sourceS3 } = setup();
        const imageBuffer = await createTestImage(200, 150);
        sourceS3.putObject("source-bucket", "abc123/test-file.jpg", imageBuffer);

        const record = makeV5FileRecord({ contentType: "image/jpeg" });
        const commands = await runner.processRecord(record);
        await executor.execute(commands);

        const values = findEntry(targetDb.batchPutRecords);
        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toBeDefined();

        const imageMetadata = values["object@metadata"]["object@image"];
        expect(imageMetadata["number@width"]).toBe(200);
        expect(imageMetadata["number@height"]).toBe(150);
        expect(imageMetadata["text@format"]).toBe("jpeg");
        expect(imageMetadata["number@orientation"]).toBeDefined();
    });

    it("should set empty metadata for non-image files", async () => {
        const { runner, executor, targetDb } = setup();
        const record = makeV5FileRecord({ contentType: "application/pdf" });
        const commands = await runner.processRecord(record);
        await executor.execute(commands);

        const values = findEntry(targetDb.batchPutRecords);
        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
    });

    it("should fall back to empty metadata when file is missing from S3", async () => {
        const { runner, executor, targetDb } = setup();
        const record = makeV5FileRecord({ contentType: "image/png" });
        const commands = await runner.processRecord(record);
        await executor.execute(commands);

        const values = findEntry(targetDb.batchPutRecords);
        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
    });

    it("should handle records without object@meta", async () => {
        const { runner, executor, targetDb } = setup();
        const record = makeV5FileRecord({ contentType: "application/pdf", hasMeta: false });
        const commands = await runner.processRecord(record);
        await executor.execute(commands);

        const values = findEntry(targetDb.batchPutRecords);
        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
    });
});
