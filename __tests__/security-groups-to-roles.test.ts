import { describe, it, expect, beforeEach } from "vitest";
import { bootstrapMigrationRunner } from "../src/utils/bootstrap-runner.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import {
  v5SecurityGroup,
  v5ContentModelGroup,
  v5FullAccessGroup,
  v5AnonymousGroup
} from "./fixtures/v5-records.ts";

describe("Security Groups to Roles", () => {
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

  it("should transform security.group to security.role", async () => {
    // Mock group lookup for permission transformation
    database.mockQueryResponse("T#root#GROUP#67af510eac973600020bb057", "A", v5ContentModelGroup);

    const runner = bootstrapMigrationRunner(config, database);

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
    expect(migratedRecord.data.permissions).toHaveLength(6);

    // Should remove webinyVersion
    expect(migratedRecord.webinyVersion).toBeUndefined();
    expect(migratedRecord.data.webinyVersion).toBeUndefined();

    // Should remove tenant attribute
    expect(migratedRecord.tenant).toBeUndefined();
    expect(migratedRecord.data.tenant).toBeUndefined();
  });

  it("should skip full-access role", async () => {
    const runner = bootstrapMigrationRunner(config, database);

    const commands = await runner.processRecord(v5FullAccessGroup);

    // Should return empty commands (record skipped)
    expect(commands).toHaveLength(0);
  });

  it("should skip anonymous role", async () => {
    const runner = bootstrapMigrationRunner(config, database);

    const commands = await runner.processRecord(v5AnonymousGroup);

    // Should return empty commands (record skipped)
    expect(commands).toHaveLength(0);
  });

  it("should remove content.i18n permission", async () => {
    database.mockQueryResponse("T#root#GROUP#67af510eac973600020bb057", "A", v5ContentModelGroup);

    const runner = bootstrapMigrationRunner(config, database);

    const commands = await runner.processRecord(v5SecurityGroup);
    await executeCommands(commands, { database, storage });

    const migratedRecord = database.batchPutRecords[0];
    const hasContentI18n = migratedRecord.data.permissions.some(
      (p: any) => p.name === "content.i18n"
    );

    expect(hasContentI18n).toBe(false);
  });

  it("should flatten cms.contentModel models from locale object to array", async () => {
    database.mockQueryResponse("T#root#GROUP#67af510eac973600020bb057", "A", v5ContentModelGroup);

    const runner = bootstrapMigrationRunner(config, database);

    const commands = await runner.processRecord(v5SecurityGroup);
    await executeCommands(commands, { database, storage });

    const migratedRecord = database.batchPutRecords[0];
    const contentModelPerm = migratedRecord.data.permissions.find(
      (p: any) => p.name === "cms.contentModel"
    );

    expect(contentModelPerm).toBeDefined();
    expect(contentModelPerm.models).toEqual(["article"]);
    expect(Array.isArray(contentModelPerm.models)).toBe(true);
  });

  it("should transform cms.contentModelGroup groups from IDs to slugs", async () => {
    database.mockQueryResponse("T#root#GROUP#67af510eac973600020bb057", "A", v5ContentModelGroup);

    const runner = bootstrapMigrationRunner(config, database);

    const commands = await runner.processRecord(v5SecurityGroup);
    await executeCommands(commands, { database, storage });

    const migratedRecord = database.batchPutRecords[0];
    const groupPerm = migratedRecord.data.permissions.find(
      (p: any) => p.name === "cms.contentModelGroup"
    );

    expect(groupPerm).toBeDefined();
    expect(groupPerm.groups).toEqual(["ungrouped"]);
    expect(Array.isArray(groupPerm.groups)).toBe(true);
  });
});
