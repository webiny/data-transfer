import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { SourceS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { MockS3Client } from "./services/S3Client/MockS3Client.ts";

interface FmFileOverrides {
    contentType?: string;
    key?: string;
    hasMeta?: boolean;
}

interface FmFileRecord extends BaseRecord {
    modelId: string;
    locale: string;
    tenant: string;
    id: string;
    entryId: string;
    values: Record<string, unknown>;
    version: number;
}

interface MigratedEntry extends BaseRecord {
    data: {
        values: Record<string, unknown>;
    };
}

interface ImageMetadata {
    "number@width"?: number;
    "number@height"?: number;
    "text@format"?: string;
    "number@orientation"?: number;
}

interface ObjectMetadata {
    "object@image"?: ImageMetadata;
}

function makeV5FileRecord(overrides: FmFileOverrides = {}): FmFileRecord {
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
        _et: "CmsEntries",
        _ct: "2025-01-01T00:00:00.000Z",
        _md: "2025-01-01T00:00:00.000Z",
        TYPE: "cms.entry.l",
        modelId: "fmFile",
        locale: "en-US",
        tenant: "root",
        id: "abc123#0001",
        entryId: "abc123",
        values,
        version: 1
    };
}

async function createTestImage(width = 100, height = 50): Promise<Buffer> {
    return sharp({
        create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } }
    })
        .jpeg()
        .toBuffer();
}

async function runAndGetValues(
    record: FmFileRecord,
    s3Seed?: (s3: MockS3Client) => void
): Promise<Record<string, unknown>> {
    const container = createDdbContainer({
        sourceRecords: { "source-table": [record as BaseRecord] }
    });
    const sourceS3 = container.resolve(SourceS3Client) as MockS3Client;
    if (s3Seed) {
        s3Seed(sourceS3);
    }
    const runner = container.resolve(PipelineRunner);
    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    v5ToV6Preset.configure(runner);

    await runner.run();

    const entry = targetDb.batchPutRecords.find(r => (r as BaseRecord).TYPE === "cms.entry.l") as
        | MigratedEntry
        | undefined;
    expect(entry).toBeDefined();
    return (entry as MigratedEntry).data.values;
}

describe("Extract Image Metadata", () => {
    it("should extract image dimensions for image files", async () => {
        const imageBuffer = await createTestImage(200, 150);
        const record = makeV5FileRecord({ contentType: "image/jpeg" });

        const values = await runAndGetValues(record, s3 => {
            s3.putObject("source-bucket", "abc123/test-file.jpg", imageBuffer);
        });

        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toBeDefined();

        const metadata = values["object@metadata"] as ObjectMetadata;
        const imageMetadata = metadata["object@image"] as ImageMetadata;
        expect(imageMetadata["number@width"]).toBe(200);
        expect(imageMetadata["number@height"]).toBe(150);
        expect(imageMetadata["text@format"]).toBe("jpeg");
        expect(imageMetadata["number@orientation"]).toBeDefined();
    });

    it("should set empty metadata for non-image files", async () => {
        const record = makeV5FileRecord({ contentType: "application/pdf" });
        const values = await runAndGetValues(record);

        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
    });

    it("should fall back to empty metadata when file is missing from S3", async () => {
        const record = makeV5FileRecord({ contentType: "image/png" });
        const values = await runAndGetValues(record);

        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
    });

    it("should handle records without object@meta", async () => {
        const record = makeV5FileRecord({ contentType: "application/pdf", hasMeta: false });
        const values = await runAndGetValues(record);

        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
    });
});
