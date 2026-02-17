import { describe, it, expect, beforeEach } from "vitest";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import {
  v5CmsFileEntry,
  v5CmsEntryWithDuplicateCme,
  v5CmsEntryLatest,
  v5CmsEntryPublished,
  v5CmsEntryWithRichText,
  v5BlogPostModel
} from "./fixtures/v5-records.ts";

describe("CMS Entries", () => {
  let database: MockDatabaseClient;
  let storage: MockStorageClient;
  let config: MigrationConfig;
  let modelProvider: ModelProvider;

  beforeEach(() => {
    database = new MockDatabaseClient();
    storage = new MockStorageClient();
    modelProvider = new ModelProvider(database, "source-table");
    config = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider
    };
  });

  it("should transform CMS file entries", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5CmsFileEntry);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;

    // Should create 2 records: the entry itself + metadata
    expect(migratedRecords.length).toBeGreaterThanOrEqual(1);

    const migratedEntry = migratedRecords.find(r => r.TYPE === "cms.entry.l");
    expect(migratedEntry).toBeDefined();

    // Should remove locale from PK
    expect(migratedEntry!.PK).not.toContain("#L#en-US#");
    expect(migratedEntry!.PK).toBe("T#root#CMS#CME#67dadc3209fa5e0002e5523f");

    // Should remove duplicate CME
    expect(migratedEntry!.PK).not.toContain("#CME#CME#");
    const cmeCount = (migratedEntry!.PK.match(/#CME#/g) || []).length;
    expect(cmeCount).toBe(1);

    // Should update modelId
    expect(migratedEntry!.data.modelId).toBe("wbyFmFile");

    // Should add GSI_TENANT
    expect(migratedEntry!.GSI_TENANT).toBe("root");

    // Should update GSI1_PK to include new modelId
    expect(migratedEntry!.GSI1_PK).toBe("T#root#CMS#CME#M#wbyFmFile#L");
    expect(migratedEntry!.GSI1_PK).not.toContain("#L#en-US#");

    // Should wrap in data envelope
    expect(migratedEntry!.data).toBeDefined();
    expect(migratedEntry!.data.values).toBeDefined();
    expect(migratedEntry!.data.location).toBeDefined();

    // Location should be at data.location (moved from root)
    expect(migratedEntry!.data.location.folderId).toBe("root");

    // values should NOT have object@location (it was removed)
    expect(migratedEntry!.data.values["object@location"]).toBeUndefined();

    // values should have the file metadata
    expect(migratedEntry!.data.values["text@name"]).toBe("NumbersGrid3.png");
    // File key should remain the same
    expect(migratedEntry!.data.values["text@key"]).toBe(
      "67dadc3209fa5e0002e5523f/NumbersGrid3.png"
    );
    expect(migratedEntry!.data.values["text@type"]).toBe("image/png");
    expect(migratedEntry!.data.values["number@size"]).toBe(131309);

    // Should remove webinyVersion
    expect(migratedEntry!.webinyVersion).toBeUndefined();
    expect(migratedEntry!.data.webinyVersion).toBeUndefined();
  });

  it("should create file metadata record", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5CmsFileEntry);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    const metadataRecord = migratedRecords.find(r => r.TYPE === "KeyValueStore");

    expect(metadataRecord).toBeDefined();
    expect(metadataRecord!.PK).toContain("FileManager/File/");
    expect(metadataRecord!.PK).toContain("/Metadata");
    expect(metadataRecord!.data.scope).toBe("global");
    expect(metadataRecord!.data.value.contentType).toBe("image/png");
    expect(metadataRecord!.data.value.size).toBe(131309);

    // bucketKey should use the NEW S3 path format (without revision in ID)
    expect(metadataRecord!.data.value.bucketKey).toBe(
      "tenants/root/files/67dadc3209fa5e0002e5523f/NumbersGrid3.png"
    );
  });

  it("should remove duplicate #CME# from PK", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5CmsEntryWithDuplicateCme);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    expect(migratedRecords).toHaveLength(1);

    const migratedRecord = migratedRecords[0];

    // Should have only one CME
    expect(migratedRecord.PK).toContain("#CME#");
    expect(migratedRecord.PK).not.toContain("#CME#CME#");

    // Count occurrences of CME
    const cmeCount = (migratedRecord.PK.match(/#CME#/g) || []).length;
    expect(cmeCount).toBe(1);
  });

  it("should update modelIds in keys and data", async () => {
    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5CmsEntryWithDuplicateCme);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    const migratedRecord = migratedRecords[0];

    // Should update modelId in data
    expect(migratedRecord.data.modelId).toBe("wbyAcoFolder");

    // Should strip revision from text@parentId
    expect(migratedRecord.data.values["text@parentId"]).toBe("696f439b9b76ee0002969341");
  });

  it("should process all CMS entry types (cms.entry, cms.entry.l, cms.entry.p)", async () => {
    const runner = createTestRunner(config, database);

    // Test cms.entry.l (latest revision)
    const commandsL = await runner.processRecord(v5CmsFileEntry);
    await executeCommands(commandsL, { database, storage });

    // Test cms.entry (latest published)
    const commandsEntry = await runner.processRecord(v5CmsEntryLatest);
    await executeCommands(commandsEntry, { database, storage });

    // Test cms.entry.p (published revision)
    const commandsP = await runner.processRecord(v5CmsEntryPublished);
    await executeCommands(commandsP, { database, storage });

    const migratedRecords = database.batchPutRecords;

    // Should have migrated all entry types
    const entryLRecord = migratedRecords.find(
      r => r.TYPE === "cms.entry.l" && r.data.modelId === "wbyFmFile"
    );
    const entryRecord = migratedRecords.find(
      r => r.TYPE === "cms.entry" && r.data.modelId === "blogPost"
    );
    const entryPRecord = migratedRecords.find(
      r => r.TYPE === "cms.entry.p" && r.data.modelId === "blogPost"
    );

    // All entry types should be processed
    expect(entryLRecord).toBeDefined();
    expect(entryRecord).toBeDefined();
    expect(entryPRecord).toBeDefined();

    // All should have locale removed from PK
    expect(entryLRecord!.PK).not.toContain("#L#en-US#");
    expect(entryRecord!.PK).not.toContain("#L#en-US#");
    expect(entryPRecord!.PK).not.toContain("#L#en-US#");

    // All should have GSI_TENANT
    expect(entryLRecord!.GSI_TENANT).toBe("root");
    expect(entryRecord!.GSI_TENANT).toBe("root");
    expect(entryPRecord!.GSI_TENANT).toBe("root");

    // All should be wrapped in data
    expect(entryLRecord!.data).toBeDefined();
    expect(entryRecord!.data).toBeDefined();
    expect(entryPRecord!.data).toBeDefined();

    // All should have values
    expect(entryLRecord!.data.values).toBeDefined();
    expect(entryRecord!.data.values).toBeDefined();
    expect(entryPRecord!.data.values).toBeDefined();
  });

  it("should transform rich-text fields recursively", async () => {
    // Mock the model query response (query without SK returns all models for that PK)
    database.mockQueryResponse("T#root#L#en-US#CMS#CM", "", v5BlogPostModel);

    // Preload models (simulates segment preloading)
    await modelProvider.preloadModels(new Map([["root", "en-US"]]));

    const runner = createTestRunner(config, database);

    const commands = await runner.processRecord(v5CmsEntryWithRichText);
    await executeCommands(commands, { database, storage });

    const migratedRecords = database.batchPutRecords;
    expect(migratedRecords).toHaveLength(1);

    const migratedRecord = migratedRecords[0];
    const values = migratedRecord.data.values;

    // Import compression utility
    const gzipCompression = await import("../src/utils/gzip-compression.ts");
    const compression = new gzipCompression.GzipCompression();

    // Check top-level rich-text field was transformed
    expect(values["rich-text@8m79z9nx"]).toBeDefined();
    expect(values["rich-text@8m79z9nx"].compression).toBe("gzip");
    expect(values["rich-text@8m79z9nx"].value).toBeDefined();

    // Verify the top-level rich-text can be decompressed
    const topLevelRTE = await compression.decompress(values["rich-text@8m79z9nx"]);
    expect(topLevelRTE).toBeDefined();
    expect(topLevelRTE.state).toBeDefined();
    expect(topLevelRTE.html).toBeDefined();
    expect(typeof topLevelRTE.state).toBe("string");
    expect(typeof topLevelRTE.html).toBe("string");
    // Verify state contains Lexical JSON
    expect(topLevelRTE.state).toContain('"root"');

    // Check rich-text field inside dynamicZone was transformed
    const dzArray = values["dynamicZone@nfyelol7"];
    expect(Array.isArray(dzArray)).toBe(true);
    expect(dzArray[0]["rich-text@xip2xhvz"]).toBeDefined();
    expect(dzArray[0]["rich-text@xip2xhvz"].compression).toBe("gzip");

    const dzRTE = await compression.decompress(dzArray[0]["rich-text@xip2xhvz"]);
    expect(dzRTE).toBeDefined();
    expect(dzRTE.state).toBeDefined();
    expect(dzRTE.html).toBeDefined();
    expect(typeof dzRTE.state).toBe("string");
    expect(typeof dzRTE.html).toBe("string");
    // Verify state contains Lexical JSON
    expect(dzRTE.state).toContain('"root"');

    // Check rich-text field inside object->array was transformed
    const objArray = values["object@f0baxz0w"];
    expect(Array.isArray(objArray)).toBe(true);
    expect(objArray[0]["rich-text@5fzaks3u"]).toBeDefined();
    expect(objArray[0]["rich-text@5fzaks3u"].compression).toBe("gzip");

    const objArrayRTE = await compression.decompress(objArray[0]["rich-text@5fzaks3u"]);
    expect(objArrayRTE).toBeDefined();
    expect(objArrayRTE.state).toBeDefined();
    expect(objArrayRTE.html).toBeDefined();
    expect(typeof objArrayRTE.state).toBe("string");
    expect(typeof objArrayRTE.html).toBe("string");
    // Verify state contains Lexical JSON
    expect(objArrayRTE.state).toContain('"root"');
  });
});
