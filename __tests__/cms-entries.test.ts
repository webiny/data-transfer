import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { ModelProvider } from "~/features/ModelProvider/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import {
    v5CmsFileEntry,
    v5CmsEntryWithDuplicateCme,
    v5CmsEntryLatest,
    v5CmsEntryPublished,
    v5CmsEntryWithRichText,
    v5BlogPostModel
} from "./fixtures/v5-records.ts";

interface CmsEntryWrapped extends BaseRecord {
    GSI_TENANT?: string;
    GSI1_PK?: string;
    webinyVersion?: string;
    data: {
        modelId?: string;
        webinyVersion?: string;
        location?: { folderId?: string };
        values?: Record<string, unknown>;
        scope?: string;
        value?: Record<string, unknown>;
        [key: string]: unknown;
    };
}

interface CompressedField {
    compression: string;
    value: string;
}

interface RichTextPayload {
    state?: string;
    html?: string;
    [key: string]: unknown;
}

describe("CMS Entries", () => {
    it("should transform CMS file entries", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": [v5CmsFileEntry as BaseRecord] }
        });
        const runner = container.resolve(PipelineRunner);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(runner);

        await runner.run();

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords.length).toBeGreaterThanOrEqual(1);

        const migratedEntry = migratedRecords.find(
            r => (r as BaseRecord).TYPE === "cms.entry.l"
        ) as CmsEntryWrapped | undefined;
        expect(migratedEntry).toBeDefined();
        const entry = migratedEntry as CmsEntryWrapped;

        expect(entry.PK).not.toContain("#L#en-US#");
        expect(entry.PK).toBe("T#root#CMS#CME#67dadc3209fa5e0002e5523f");
        expect(entry.PK).not.toContain("#CME#CME#");
        const cmeCount = (entry.PK.match(/#CME#/g) || []).length;
        expect(cmeCount).toBe(1);

        expect(entry.data.modelId).toBe("wbyFmFile");
        expect(entry.GSI_TENANT).toBe("root");
        expect(entry.GSI1_PK).toBe("T#root#CMS#CME#M#wbyFmFile#L");
        expect(entry.GSI1_PK).not.toContain("#L#en-US#");

        expect(entry.data).toBeDefined();
        expect(entry.data.values).toBeDefined();
        const location = entry.data.location as { folderId?: string };
        expect(location).toBeDefined();
        expect(location.folderId).toBe("root");
        const values = entry.data.values as Record<string, unknown>;
        expect(values["object@location"]).toBeUndefined();
        expect(values["text@name"]).toBe("NumbersGrid3.png");
        expect(values["text@key"]).toBe("67dadc3209fa5e0002e5523f/NumbersGrid3.png");
        expect(values["text@type"]).toBe("image/png");
        expect(values["number@size"]).toBe(131309);
        expect(entry.webinyVersion).toBeUndefined();
        expect(entry.data.webinyVersion).toBeUndefined();
    });

    it("should create file metadata record", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": [v5CmsFileEntry as BaseRecord] }
        });
        const runner = container.resolve(PipelineRunner);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(runner);

        await runner.run();

        const metadataRecord = targetDb.batchPutRecords.find(
            r => (r as BaseRecord).TYPE === "KeyValueStore"
        ) as CmsEntryWrapped | undefined;

        expect(metadataRecord).toBeDefined();
        const meta = metadataRecord as CmsEntryWrapped;
        expect(meta.PK).toContain("FileManager/File/");
        expect(meta.PK).toContain("/Metadata");
        expect(meta.data.scope).toBe("global");
        const value = meta.data.value as Record<string, unknown>;
        expect(value.contentType).toBe("image/png");
        expect(value.size).toBe(131309);
        expect(value.bucketKey).toBe(
            "tenants/root/files/67dadc3209fa5e0002e5523f/NumbersGrid3.png"
        );
    });

    it("should remove duplicate #CME# from PK", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": [v5CmsEntryWithDuplicateCme as BaseRecord] }
        });
        const runner = container.resolve(PipelineRunner);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(runner);

        await runner.run();

        expect(targetDb.batchPutRecords).toHaveLength(1);
        const migratedRecord = targetDb.batchPutRecords[0] as BaseRecord;

        expect(migratedRecord.PK).toContain("#CME#");
        expect(migratedRecord.PK).not.toContain("#CME#CME#");
        const cmeCount = (migratedRecord.PK.match(/#CME#/g) || []).length;
        expect(cmeCount).toBe(1);
    });

    it("should update modelIds in keys and data", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": [v5CmsEntryWithDuplicateCme as BaseRecord] }
        });
        const runner = container.resolve(PipelineRunner);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(runner);

        await runner.run();

        const migratedRecord = targetDb.batchPutRecords[0] as CmsEntryWrapped;
        expect(migratedRecord.data.modelId).toBe("wbyAcoFolder");
        const values = migratedRecord.data.values as Record<string, unknown>;
        expect(values["text@parentId"]).toBe("696f439b9b76ee0002969341");
    });

    it("should process all CMS entry types (cms.entry, cms.entry.l, cms.entry.p)", async () => {
        const container = createDdbContainer({
            sourceRecords: {
                "source-table": [
                    v5CmsFileEntry as BaseRecord,
                    v5CmsEntryLatest as BaseRecord,
                    v5CmsEntryPublished as BaseRecord
                ]
            }
        });
        const runner = container.resolve(PipelineRunner);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(runner);

        await runner.run();

        const migratedRecords = targetDb.batchPutRecords as CmsEntryWrapped[];

        const entryLRecord = migratedRecords.find(
            r => r.TYPE === "cms.entry.l" && r.data.modelId === "wbyFmFile"
        );
        const entryRecord = migratedRecords.find(
            r => r.TYPE === "cms.entry" && r.data.modelId === "blogPost"
        );
        const entryPRecord = migratedRecords.find(
            r => r.TYPE === "cms.entry.p" && r.data.modelId === "blogPost"
        );

        expect(entryLRecord).toBeDefined();
        expect(entryRecord).toBeDefined();
        expect(entryPRecord).toBeDefined();
        const latest = entryLRecord as CmsEntryWrapped;
        const normal = entryRecord as CmsEntryWrapped;
        const published = entryPRecord as CmsEntryWrapped;
        expect(latest.PK).not.toContain("#L#en-US#");
        expect(normal.PK).not.toContain("#L#en-US#");
        expect(published.PK).not.toContain("#L#en-US#");
        expect(latest.GSI_TENANT).toBe("root");
        expect(normal.GSI_TENANT).toBe("root");
        expect(published.GSI_TENANT).toBe("root");
        expect(latest.data).toBeDefined();
        expect(normal.data).toBeDefined();
        expect(published.data).toBeDefined();
        expect(latest.data.values).toBeDefined();
        expect(normal.data.values).toBeDefined();
        expect(published.data.values).toBeDefined();
    });

    it("should transform rich-text fields recursively", async () => {
        const container = createDdbContainer({
            sourceRecords: {
                "source-table": [
                    v5BlogPostModel as BaseRecord,
                    v5CmsEntryWithRichText as BaseRecord
                ]
            }
        });
        const runner = container.resolve(PipelineRunner);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const modelProvider = container.resolve(ModelProvider);
        await modelProvider.preloadModels(new Map([["root", "en-US"]]));
        v5ToV6Preset.configure(runner);

        await runner.run();

        const entryRecords = targetDb.batchPutRecords.filter(
            r => (r as BaseRecord).TYPE === "cms.entry.l"
        ) as CmsEntryWrapped[];
        expect(entryRecords).toHaveLength(1);

        const migratedRecord = entryRecords[0];
        const values = migratedRecord.data.values as Record<string, unknown>;

        const gzip = container.resolve(GzipCompression);

        const topLevel = values["rich-text@8m79z9nx"] as CompressedField;
        expect(topLevel).toBeDefined();
        expect(topLevel.compression).toBe("gzip");
        expect(topLevel.value).toBeDefined();

        const topLevelRTE = (await gzip.decompress(topLevel)) as RichTextPayload;
        expect(topLevelRTE).toBeDefined();
        expect(topLevelRTE.state).toBeDefined();
        expect(topLevelRTE.html).toBeDefined();
        expect(typeof topLevelRTE.state).toBe("string");
        expect(typeof topLevelRTE.html).toBe("string");
        expect(topLevelRTE.state).toContain('"root"');

        const dzArray = values["dynamicZone@nfyelol7"] as Record<string, unknown>[];
        expect(Array.isArray(dzArray)).toBe(true);
        const dzField = dzArray[0]["rich-text@xip2xhvz"] as CompressedField;
        expect(dzField).toBeDefined();
        expect(dzField.compression).toBe("gzip");

        const dzRTE = (await gzip.decompress(dzField)) as RichTextPayload;
        expect(dzRTE.state).toContain('"root"');

        const objArray = values["object@f0baxz0w"] as Record<string, unknown>[];
        expect(Array.isArray(objArray)).toBe(true);
        const objField = objArray[0]["rich-text@5fzaks3u"] as CompressedField;
        expect(objField).toBeDefined();
        expect(objField.compression).toBe("gzip");

        const objArrayRTE = (await gzip.decompress(objField)) as RichTextPayload;
        expect(objArrayRTE.state).toContain('"root"');
    });
});
