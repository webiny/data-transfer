import { describe, it, expect, beforeEach } from "vitest";
import { bootstrapMigrationRunner } from "../src/utils/bootstrap-runner.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import {
  v5SecurityGroup,
  v5FileManagerSettings,
  v5MailerSettings,
  v5CmsFileEntry,
  v5FolderRecord,
  v5CmsEntryWithDuplicateCme,
  v5UnknownRecord
} from "./fixtures/v5-records.ts";

describe("MigrationRunner", () => {
  let database: MockDatabaseClient;
  let storage: MockStorageClient;
  let config: MigrationConfig;

  beforeEach(() => {
    database = new MockDatabaseClient();
    storage = new MockStorageClient();
    config = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket"
    };
  });

  describe("Security Groups to Roles", () => {
    it("should transform security.group to security.role", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5SecurityGroup);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      expect(migratedRecords).toHaveLength(1);

      const migratedRecord = migratedRecords[0];

      // Should change TYPE
      expect(migratedRecord.TYPE).toBe("security.role");

      // Should change _et
      expect(migratedRecord._et).toBe("SecurityRole");

      // Should remove locale from keys
      expect(migratedRecord.PK).not.toContain("#L#en-US#");
      expect(migratedRecord.GSI1_PK).not.toContain("#L#en-US#");

      // Should change GROUP -> ROLE in keys
      expect(migratedRecord.PK).toContain("#ROLE#");
      expect(migratedRecord.PK).not.toContain("#GROUP#");
      expect(migratedRecord.GSI1_PK).toContain("#ROLES");
      expect(migratedRecord.GSI1_PK).not.toContain("#GROUPS");

      // Should add GSI_TENANT
      expect(migratedRecord.GSI_TENANT).toBe("root");

      // Should wrap in data envelope
      expect(migratedRecord.data).toBeDefined();
      expect(migratedRecord.data.name).toBe("Test Role #1");
      expect(migratedRecord.data.permissions).toHaveLength(2);

      // Should remove webinyVersion
      expect(migratedRecord.webinyVersion).toBeUndefined();
      expect(migratedRecord.data.webinyVersion).toBeUndefined();
    });
  });

  describe("File Manager Settings", () => {
    it("should migrate FM settings to KeyValue format", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5FileManagerSettings);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      expect(migratedRecords).toHaveLength(1);

      const migratedRecord = migratedRecords[0];

      // Should change to KeyValue format
      expect(migratedRecord.PK).toBe("KV#root:FileManager/General");
      expect(migratedRecord.SK).toBe("A");
      expect(migratedRecord.TYPE).toBe("KeyValueStore");
      expect(migratedRecord._et).toBe("KeyValueStore");

      // Should have proper data structure
      expect(migratedRecord.data.key).toBe("FileManager/General");
      expect(migratedRecord.data.scope).toBe("root");
      expect(migratedRecord.data.value).toBeDefined();
      expect(migratedRecord.data.value.srcPrefix).toBe(
        "https://d8eqa02y4s7ns.cloudfront.net/files/"
      );
      expect(migratedRecord.data.value.uploadMaxFileSize).toBe(10737418240);

      // Should not have tenant in value
      expect(migratedRecord.data.value.tenant).toBeUndefined();

      // Should add GSI_TENANT
      expect(migratedRecord.GSI_TENANT).toBe("root");
    });
  });

  describe("Mailer Settings", () => {
    it("should migrate mailer settings to KeyValue format", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5MailerSettings);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      expect(migratedRecords).toHaveLength(1);

      const migratedRecord = migratedRecords[0];

      // Should change to KeyValue format
      expect(migratedRecord.PK).toBe("KV#root:Mailer/Settings/Transport");
      expect(migratedRecord.SK).toBe("A");
      expect(migratedRecord.TYPE).toBe("KeyValueStore");

      // Should have proper data structure
      expect(migratedRecord.data.key).toBe("Mailer/Settings/Transport");
      expect(migratedRecord.data.scope).toBe("root");
      expect(migratedRecord.data.value).toBeDefined();
      expect(migratedRecord.data.value.from).toBe("noreply@hostname.com");
      expect(migratedRecord.data.value.host).toBe("hostname.com");
      expect(migratedRecord.data.value.password).toBe(
        "U2FsdGVkX1/6k2xNUKb2oeQD+570saZOZyYGKpo+0PI="
      );
    });
  });

  describe("CMS Entries", () => {
    it("should transform CMS file entries", async () => {
      const runner = bootstrapMigrationRunner(config);

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
      expect(migratedEntry!.data.values["text@name"]).toBe(
        "Numbers Grid 3.png"
      );
      // File key should be updated to new S3 path format (without revision in ID)
      expect(migratedEntry!.data.values["text@key"]).toBe(
        "tenants/root/files/67dadc3209fa5e0002e5523f/Numbers Grid 3.png"
      );
      expect(migratedEntry!.data.values["text@type"]).toBe("image/png");
      expect(migratedEntry!.data.values["number@size"]).toBe(131309);

      // Should remove webinyVersion
      expect(migratedEntry!.webinyVersion).toBeUndefined();
      expect(migratedEntry!.data.webinyVersion).toBeUndefined();
    });

    it("should create file metadata record", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5CmsFileEntry);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      const metadataRecord = migratedRecords.find(
        r => r.TYPE === "KeyValueStore"
      );

      expect(metadataRecord).toBeDefined();
      expect(metadataRecord!.PK).toContain("FileManager/File/");
      expect(metadataRecord!.PK).toContain("/Metadata");
      expect(metadataRecord!.data.scope).toBe("global");
      expect(metadataRecord!.data.value.contentType).toBe("image/png");
      expect(metadataRecord!.data.value.size).toBe(131309);

      // bucketKey should use the NEW S3 path format (without revision in ID)
      expect(metadataRecord!.data.value.bucketKey).toBe(
        "tenants/root/files/67dadc3209fa5e0002e5523f/Numbers Grid 3.png"
      );
    });

    it("should remove duplicate #CME# from PK", async () => {
      const runner = bootstrapMigrationRunner(config);

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
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5CmsEntryWithDuplicateCme);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      const migratedRecord = migratedRecords[0];

      // Should update modelId in data
      expect(migratedRecord.data.modelId).toBe("wbyAcoFolder");
    });
  });

  describe("Folder Records", () => {
    it("should remove #0001 from folder IDs", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5FolderRecord);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      expect(migratedRecords).toHaveLength(1);

      const migratedRecord = migratedRecords[0];

      // Should remove #0001 from ids (data is wrapped, so original data becomes data.data)
      expect(migratedRecord.data.id).toBe("folder123");
      expect(migratedRecord.data.parentId).toBe("root");
      expect(migratedRecord.data.id).not.toContain("#0001");
      expect(migratedRecord.data.parentId).not.toContain("#0001");
    });
  });

  describe("Global Transformations", () => {
    it("should wrap non-reserved attributes in data envelope", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5SecurityGroup);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      const migratedRecord = migratedRecords[0];

      // Reserved attributes should be at top level
      expect(migratedRecord.PK).toBeDefined();
      expect(migratedRecord.SK).toBeDefined();
      expect(migratedRecord.TYPE).toBeDefined();
      expect(migratedRecord.GSI_TENANT).toBeDefined();

      // Non-reserved attributes should be in data
      expect(migratedRecord.name).toBeUndefined();
      expect(migratedRecord.permissions).toBeUndefined();
      expect(migratedRecord.slug).toBeUndefined();

      // Should be in data instead
      expect(migratedRecord.data.name).toBe("Test Role #1");
      expect(migratedRecord.data.permissions).toBeDefined();
      expect(migratedRecord.data.slug).toBe("test-role-1");
    });

    it("should add GSI_TENANT attribute", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5SecurityGroup);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      const migratedRecord = migratedRecords[0];

      expect(migratedRecord.GSI_TENANT).toBe("root");
    });

    it("should remove locale from all keys", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5SecurityGroup);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      const migratedRecord = migratedRecords[0];

      // No keys should contain locale pattern
      expect(migratedRecord.PK).not.toContain("#L#en-US#");
      expect(migratedRecord.GSI1_PK).not.toContain("#L#en-US#");
    });

    it("should remove webinyVersion attribute", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5SecurityGroup);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;
      const migratedRecord = migratedRecords[0];

      expect(migratedRecord.webinyVersion).toBeUndefined();
      expect(migratedRecord.data.webinyVersion).toBeUndefined();
    });
  });

  describe("Record Filtering", () => {
    it("should skip records without matching pipeline", async () => {
      const runner = bootstrapMigrationRunner(config);

      const commands = await runner.processRecord(v5UnknownRecord);

      // Should return empty commands array (record skipped)
      expect(commands).toHaveLength(0);
    });
  });

  describe("Batch Processing", () => {
    it("should process multiple records", async () => {
      const runner = bootstrapMigrationRunner(config);

      const records = [
        v5SecurityGroup,
        v5FileManagerSettings,
        v5MailerSettings
      ];

      const commands = await runner.processAll(records);
      await executeCommands(commands, { database, storage });

      const migratedRecords = database.batchPutRecords;

      // Should have migrated all 3 records
      expect(migratedRecords.length).toBeGreaterThanOrEqual(3);

      // Check that different types were processed
      const types = migratedRecords.map(r => r.TYPE);
      expect(types).toContain("security.role");
      expect(types).toContain("KeyValueStore");
    });
  });
});
