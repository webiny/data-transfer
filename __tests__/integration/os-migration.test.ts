import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setup, startDb, stopDb, createTables, deleteTables } from "jest-dynalite";
import { Client } from "@opensearch-project/opensearch";
import { DynamoDBClient } from "../../src/database/dynamodb-client.ts";
import { generateOsRecords } from "../utils/os-record-mocker.ts";
import { executeOsCommands, type OsCommandItem } from "../../src/opensearch/executor.ts";
import { decompressOsRecord, stripLocaleFromIndex } from "../../src/opensearch/decompress-record.ts";
import { isTransformedRecord } from "../../src/utils/record-guards.ts";
import { MigrationRunner } from "../../src/core/runner.ts";
import { MigrationConfig, PutRecordCommand } from "../../src/core/types.ts";
import { ModelProvider } from "../../src/models/model-provider.ts";
import { loadPreset } from "../../src/core/preset-loader.ts";
import { GzipCompression } from "../../src/utils/gzip-compression.ts";

const gzip = new GzipCompression();

// ============================================================================
// Setup: dynalite for DDB, local OS client (no auth)
// ============================================================================

setup(__dirname + "/../..");

const OS_ENDPOINT = "http://localhost:9200";

function createLocalOsClient(): Client {
  return new Client({
    node: OS_ENDPOINT
  });
}

let dynalitePort: number;
let sourceDb: DynamoDBClient;
let targetDb: DynamoDBClient;
let osClient: Client;
const createdIndexes = new Set<string>();

beforeAll(async () => {
  await startDb();

  // jest-dynalite sets MOCK_DYNAMODB_ENDPOINT
  const endpoint = process.env.MOCK_DYNAMODB_ENDPOINT;
  dynalitePort = parseInt(endpoint?.split(":").pop() || "8001", 10);

  sourceDb = new DynamoDBClient({
    region: "local",
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
    endpoint
  });

  targetDb = new DynamoDBClient({
    region: "local",
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
    endpoint
  });

  osClient = createLocalOsClient();
}, 30000);

afterAll(async () => {
  // Only delete indexes that were created during tests
  for (const indexName of createdIndexes) {
    try {
      await osClient.indices.delete({ index: indexName });
    } catch {
      // Index may not exist or OS might not be running
    }
  }

  await stopDb();
}, 30000);

beforeEach(async () => {
  await deleteTables();
  await createTables();
});

// ============================================================================
// Tests
// ============================================================================

describe("OS migration integration", () => {
  it("should write gzipped records to target DDB table via OS executor", async () => {
    // Generate mock OS records
    const mockRecords = await generateOsRecords({ entries: 3 });

    // Seed source OS table
    for (const record of mockRecords) {
      await sourceDb.put("source-os", record as any);
    }

    // Verify source has data
    const sourceRecords: any[] = [];
    for await (const record of sourceDb.scan("source-os")) {
      sourceRecords.push(record);
    }
    expect(sourceRecords).toHaveLength(6); // 3 entries * 2 (L + P)

    // Decompress, transform via pipeline, write via OS executor
    const modelProvider = new ModelProvider(sourceDb, "source-primary");
    const migrationConfig: MigrationConfig = {
      sourcePrimaryTable: "source-primary",
      targetPrimaryTable: "target-os",
      sourceFmBucket: "",
      targetFmBucket: "",
      modelProvider
    };

    const preset = await loadPreset("v5-to-v6-os");
    const runner = new MigrationRunner(migrationConfig, sourceDb);
    preset.configure(runner, migrationConfig, sourceDb);

    const knownIndexes = new Set<string>();
    const osItems: OsCommandItem[] = [];

    for (const record of sourceRecords) {
      const decompressed = await decompressOsRecord(record);
      if (!decompressed) {
        continue;
      }

      const locale = (decompressed.record.locale as string) || "en-US";
      const commands = await runner.processRecord(decompressed.record);

      for (const cmd of commands) {
        if (cmd.type === "PUT_RECORD") {
          const rec = (cmd as PutRecordCommand).record;
          if (isTransformedRecord(rec)) {
            osItems.push({ record: rec, metadata: decompressed.metadata, locale });
          }
        }
      }
    }

    expect(osItems.length).toBeGreaterThan(0);

    await executeOsCommands(osItems, {
      database: targetDb,
      targetTable: "target-os",
      osClient,
      knownIndexes,
      retrySchedule: [100, 100]
    });

    // Track created indexes for cleanup
    for (const idx of knownIndexes) {
      createdIndexes.add(idx);
    }

    // Verify target table has gzipped records
    const targetRecords: any[] = [];
    for await (const record of targetDb.scan("target-os")) {
      targetRecords.push(record);
    }

    expect(targetRecords).toHaveLength(osItems.length);

    // Verify each record has correct OS shape
    for (const record of targetRecords) {
      expect(record.PK).toBeDefined();
      expect(record.SK).toBeDefined();
      expect(record.TYPE).toBeDefined();
      expect(record.GSI_TENANT).toBeDefined();
      expect(record._et).toBe("CmsEntriesElasticsearch");
      expect(record._ct).toBeDefined();
      expect(record._md).toBeDefined();
      expect(record.index).toBeDefined();
      // Index should have locale stripped
      expect(record.index).not.toContain("en-us");
      // Data should be gzipped
      expect(record.data.compression).toBe("gzip");
      expect(typeof record.data.value).toBe("string");

      // Verify gzipped content is valid
      const inner = await gzip.decompress(record.data);
      expect(inner).not.toBeNull();
    }
  }, 30000);

  it("should create OS indexes for records", async () => {
    const mockRecords = await generateOsRecords({
      entries: 2,
      modelIds: ["category", "article"]
    });

    // Decompress to get items
    const osItems: OsCommandItem[] = [];
    const modelProvider = new ModelProvider(sourceDb, "source-primary");
    const migrationConfig: MigrationConfig = {
      sourcePrimaryTable: "source-primary",
      targetPrimaryTable: "target-os",
      sourceFmBucket: "",
      targetFmBucket: "",
      modelProvider
    };

    const preset = await loadPreset("v5-to-v6-os");
    const runner = new MigrationRunner(migrationConfig, sourceDb);
    preset.configure(runner, migrationConfig, sourceDb);

    for (const record of mockRecords) {
      const decompressed = await decompressOsRecord(record);
      if (!decompressed) {
        continue;
      }

      const locale = (decompressed.record.locale as string) || "en-US";
      const commands = await runner.processRecord(decompressed.record);

      for (const cmd of commands) {
        if (cmd.type === "PUT_RECORD") {
          const rec = (cmd as PutRecordCommand).record;
          if (isTransformedRecord(rec)) {
            osItems.push({ record: rec, metadata: decompressed.metadata, locale });
          }
        }
      }
    }

    const knownIndexes = new Set<string>();

    await executeOsCommands(osItems, {
      database: targetDb,
      targetTable: "target-os",
      osClient,
      knownIndexes,
      retrySchedule: [100, 100]
    });

    // Track created indexes for cleanup
    for (const idx of knownIndexes) {
      createdIndexes.add(idx);
    }

    // Verify indexes were created in OS
    const { body: indexes } = await osClient.cat.indices({ format: "json" });
    const indexNames = (indexes || [])
      .map((idx: any) => idx.index)
      .filter((name: string) => name && !name.startsWith("."));

    // Should have category and article indexes (locale stripped)
    expect(indexNames).toContain("root-headless-cms-category");
    expect(indexNames).toContain("root-headless-cms-article");

    // Verify indexes are cached
    expect(knownIndexes.has("root-headless-cms-category")).toBe(true);
    expect(knownIndexes.has("root-headless-cms-article")).toBe(true);
  }, 30000);

  it("should skip page records during decompression", async () => {
    const mockRecords = await generateOsRecords({ entries: 2, pages: 3 });

    let cmsCount = 0;
    let skippedCount = 0;

    for (const record of mockRecords) {
      const decompressed = await decompressOsRecord(record);
      if (decompressed) {
        cmsCount++;
      } else {
        skippedCount++;
      }
    }

    expect(cmsCount).toBe(4);  // 2 entries * 2 (L + P)
    expect(skippedCount).toBe(6); // 3 pages * 2 (L + P)
  });
});
