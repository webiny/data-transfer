import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { ModelProvider } from "~/features/ModelProvider/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/index.ts";
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

function setup(withModel = false) {
    const sourceRecords = withModel ? { "source-table": [v5BlogPostModel as any] } : undefined;
    const container = createDdbContainer({ sourceRecords });
    const runner = container.resolve(PipelineRunner);
    const executor = container.resolve(DdbCommandExecutor);
    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    v5ToV6Preset.configure(runner);
    return { container, runner, executor, targetDb };
}

describe("CMS Entries", () => {
    it("should transform CMS file entries", async () => {
        const { runner, executor, targetDb } = setup();

        const commands = await runner.processRecord(v5CmsFileEntry as any);
        await executor.execute(commands);

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords.length).toBeGreaterThanOrEqual(1);

        const migratedEntry = migratedRecords.find((r: any) => r.TYPE === "cms.entry.l") as any;
        expect(migratedEntry).toBeDefined();

        expect(migratedEntry.PK).not.toContain("#L#en-US#");
        expect(migratedEntry.PK).toBe("T#root#CMS#CME#67dadc3209fa5e0002e5523f");
        expect(migratedEntry.PK).not.toContain("#CME#CME#");
        const cmeCount = (migratedEntry.PK.match(/#CME#/g) || []).length;
        expect(cmeCount).toBe(1);

        expect(migratedEntry.data.modelId).toBe("wbyFmFile");
        expect(migratedEntry.GSI_TENANT).toBe("root");
        expect(migratedEntry.GSI1_PK).toBe("T#root#CMS#CME#M#wbyFmFile#L");
        expect(migratedEntry.GSI1_PK).not.toContain("#L#en-US#");

        expect(migratedEntry.data).toBeDefined();
        expect(migratedEntry.data.values).toBeDefined();
        expect(migratedEntry.data.location).toBeDefined();
        expect(migratedEntry.data.location.folderId).toBe("root");
        expect(migratedEntry.data.values["object@location"]).toBeUndefined();
        expect(migratedEntry.data.values["text@name"]).toBe("NumbersGrid3.png");
        expect(migratedEntry.data.values["text@key"]).toBe(
            "67dadc3209fa5e0002e5523f/NumbersGrid3.png"
        );
        expect(migratedEntry.data.values["text@type"]).toBe("image/png");
        expect(migratedEntry.data.values["number@size"]).toBe(131309);
        expect(migratedEntry.webinyVersion).toBeUndefined();
        expect(migratedEntry.data.webinyVersion).toBeUndefined();
    });

    it("should create file metadata record", async () => {
        const { runner, executor, targetDb } = setup();

        const commands = await runner.processRecord(v5CmsFileEntry as any);
        await executor.execute(commands);

        const metadataRecord = targetDb.batchPutRecords.find(
            (r: any) => r.TYPE === "KeyValueStore"
        ) as any;

        expect(metadataRecord).toBeDefined();
        expect(metadataRecord.PK).toContain("FileManager/File/");
        expect(metadataRecord.PK).toContain("/Metadata");
        expect(metadataRecord.data.scope).toBe("global");
        expect(metadataRecord.data.value.contentType).toBe("image/png");
        expect(metadataRecord.data.value.size).toBe(131309);
        expect(metadataRecord.data.value.bucketKey).toBe(
            "tenants/root/files/67dadc3209fa5e0002e5523f/NumbersGrid3.png"
        );
    });

    it("should remove duplicate #CME# from PK", async () => {
        const { runner, executor, targetDb } = setup();

        const commands = await runner.processRecord(v5CmsEntryWithDuplicateCme as any);
        await executor.execute(commands);

        expect(targetDb.batchPutRecords).toHaveLength(1);
        const migratedRecord = targetDb.batchPutRecords[0] as any;

        expect(migratedRecord.PK).toContain("#CME#");
        expect(migratedRecord.PK).not.toContain("#CME#CME#");
        const cmeCount = (migratedRecord.PK.match(/#CME#/g) || []).length;
        expect(cmeCount).toBe(1);
    });

    it("should update modelIds in keys and data", async () => {
        const { runner, executor, targetDb } = setup();

        const commands = await runner.processRecord(v5CmsEntryWithDuplicateCme as any);
        await executor.execute(commands);

        const migratedRecord = targetDb.batchPutRecords[0] as any;
        expect(migratedRecord.data.modelId).toBe("wbyAcoFolder");
        expect(migratedRecord.data.values["text@parentId"]).toBe("696f439b9b76ee0002969341");
    });

    it("should process all CMS entry types (cms.entry, cms.entry.l, cms.entry.p)", async () => {
        const { runner, executor, targetDb } = setup();

        await executor.execute(await runner.processRecord(v5CmsFileEntry as any));
        await executor.execute(await runner.processRecord(v5CmsEntryLatest as any));
        await executor.execute(await runner.processRecord(v5CmsEntryPublished as any));

        const migratedRecords = targetDb.batchPutRecords as any[];

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
        expect(entryLRecord.PK).not.toContain("#L#en-US#");
        expect(entryRecord.PK).not.toContain("#L#en-US#");
        expect(entryPRecord.PK).not.toContain("#L#en-US#");
        expect(entryLRecord.GSI_TENANT).toBe("root");
        expect(entryRecord.GSI_TENANT).toBe("root");
        expect(entryPRecord.GSI_TENANT).toBe("root");
        expect(entryLRecord.data).toBeDefined();
        expect(entryRecord.data).toBeDefined();
        expect(entryPRecord.data).toBeDefined();
        expect(entryLRecord.data.values).toBeDefined();
        expect(entryRecord.data.values).toBeDefined();
        expect(entryPRecord.data.values).toBeDefined();
    });

    it("should transform rich-text fields recursively", async () => {
        const { container, runner, executor, targetDb } = setup(true);
        const modelProvider = container.resolve(ModelProvider);
        await modelProvider.preloadModels(new Map([["root", "en-US"]]));

        const commands = await runner.processRecord(v5CmsEntryWithRichText as any);
        await executor.execute(commands);

        expect(targetDb.batchPutRecords).toHaveLength(1);

        const migratedRecord = targetDb.batchPutRecords[0] as any;
        const values = migratedRecord.data.values;

        const gzip = container.resolve(GzipCompression);

        expect(values["rich-text@8m79z9nx"]).toBeDefined();
        expect(values["rich-text@8m79z9nx"].compression).toBe("gzip");
        expect(values["rich-text@8m79z9nx"].value).toBeDefined();

        const topLevelRTE = (await gzip.decompress(values["rich-text@8m79z9nx"])) as any;
        expect(topLevelRTE).toBeDefined();
        expect(topLevelRTE.state).toBeDefined();
        expect(topLevelRTE.html).toBeDefined();
        expect(typeof topLevelRTE.state).toBe("string");
        expect(typeof topLevelRTE.html).toBe("string");
        expect(topLevelRTE.state).toContain('"root"');

        const dzArray = values["dynamicZone@nfyelol7"];
        expect(Array.isArray(dzArray)).toBe(true);
        expect(dzArray[0]["rich-text@xip2xhvz"]).toBeDefined();
        expect(dzArray[0]["rich-text@xip2xhvz"].compression).toBe("gzip");

        const dzRTE = (await gzip.decompress(dzArray[0]["rich-text@xip2xhvz"])) as any;
        expect(dzRTE.state).toContain('"root"');

        const objArray = values["object@f0baxz0w"];
        expect(Array.isArray(objArray)).toBe(true);
        expect(objArray[0]["rich-text@5fzaks3u"]).toBeDefined();
        expect(objArray[0]["rich-text@5fzaks3u"].compression).toBe("gzip");

        const objArrayRTE = (await gzip.decompress(objArray[0]["rich-text@5fzaks3u"])) as any;
        expect(objArrayRTE.state).toContain('"root"');
    });
});
