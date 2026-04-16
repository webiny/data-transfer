import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeOsCommands,
  type OsCommandItem,
  type OsExecutorDependencies
} from "../src/opensearch/executor.ts";
import { GzipCompression } from "../src/utils/gzip-compression.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";

const gzip = new GzipCompression();

function createMockOsClient() {
  return {
    indices: {
      exists: vi.fn(),
      create: vi.fn(),
      putSettings: vi.fn().mockResolvedValue({}),
      getSettings: vi.fn().mockResolvedValue({
        body: {}
      })
    }
  } as any;
}

describe("executeOsCommands", () => {
  it("should gzip record data and write OS-shaped records to target table", async () => {
    const database = new MockDatabaseClient();
    const batchPutSpy = vi.spyOn(database, "batchPut");

    const items: OsCommandItem[] = [
      {
        record: {
          PK: "T#root#CMS#CME#abc123",
          SK: "L",
          TYPE: "cms.entry.l",
          GSI_TENANT: "root",
          data: { modelId: "category", values: { title: "Test" } }
        },
        metadata: {
          index: "root-headless-cms-en-us-category",
          _ct: "2026-04-13T09:00:00.000Z",
          _md: "2026-04-13T09:00:00.000Z"
        },
        locale: "en-US"
      }
    ];

    await executeOsCommands(items, {
      database,
      targetTable: "target-os-table"
    });

    expect(batchPutSpy).toHaveBeenCalledTimes(1);
    const [table, records] = batchPutSpy.mock.calls[0];
    expect(table).toBe("target-os-table");
    expect(records).toHaveLength(1);

    const osRecord = records[0];
    expect(osRecord.PK).toBe("T#root#CMS#CME#abc123");
    expect(osRecord.SK).toBe("L");
    expect(osRecord.TYPE).toBe("cms.entry.l");
    expect(osRecord.GSI_TENANT).toBe("root");
    expect(osRecord.index).toBe("root-headless-cms-category");
    expect(osRecord._et).toBe("CmsEntriesElasticsearch");
    expect(osRecord._ct).toBe("2026-04-13T09:00:00.000Z");
    expect(osRecord._md).toBe("2026-04-13T09:00:00.000Z");
    expect((osRecord.data as any).compression).toBe("gzip");
    expect(typeof (osRecord.data as any).value).toBe("string");

    // Verify gzipped content can be decompressed back
    const decompressed = await gzip.decompress(osRecord.data as any);
    expect(decompressed.modelId).toBe("category");
    expect(decompressed.values).toEqual({ title: "Test" });
  });

  it("should gzip multiple records in parallel", async () => {
    const database = new MockDatabaseClient();
    const batchPutSpy = vi.spyOn(database, "batchPut");

    const items: OsCommandItem[] = [
      {
        record: {
          PK: "T#root#CMS#CME#aaa",
          SK: "L",
          TYPE: "cms.entry.l",
          GSI_TENANT: "root",
          data: { modelId: "category", values: { title: "A" } }
        },
        metadata: {
          index: "root-headless-cms-en-us-category",
          _ct: "2026-01-01T00:00:00Z",
          _md: "2026-01-01T00:00:00Z"
        },
        locale: "en-US"
      },
      {
        record: {
          PK: "T#root#CMS#CME#bbb",
          SK: "P",
          TYPE: "cms.entry.p",
          GSI_TENANT: "root",
          data: { modelId: "article", values: { title: "B" } }
        },
        metadata: {
          index: "root-headless-cms-en-us-article",
          _ct: "2026-01-02T00:00:00Z",
          _md: "2026-01-02T00:00:00Z"
        },
        locale: "en-US"
      }
    ];

    await executeOsCommands(items, {
      database,
      targetTable: "target-os-table"
    });

    expect(batchPutSpy).toHaveBeenCalledTimes(1);
    const [, records] = batchPutSpy.mock.calls[0];
    expect(records).toHaveLength(2);
    expect(records[0].PK).toBe("T#root#CMS#CME#aaa");
    expect(records[0].index).toBe("root-headless-cms-category");
    expect(records[1].PK).toBe("T#root#CMS#CME#bbb");
    expect(records[1].index).toBe("root-headless-cms-article");
  });

  it("should skip empty items list", async () => {
    const database = new MockDatabaseClient();
    const batchPutSpy = vi.spyOn(database, "batchPut");

    await executeOsCommands([], { database, targetTable: "target-os-table" });

    expect(batchPutSpy).not.toHaveBeenCalled();
  });
});

describe("index creation", () => {
  let database: MockDatabaseClient;
  let osClient: ReturnType<typeof createMockOsClient>;
  let touchedIndexes: Map<string, string>;

  beforeEach(() => {
    database = new MockDatabaseClient();
    vi.spyOn(database, "batchPut").mockResolvedValue();
    osClient = createMockOsClient();
    touchedIndexes = new Map();
  });

  function makeDeps(): OsExecutorDependencies {
    return {
      database,
      targetTable: "target-os-table",
      osClient,
      touchedIndexes,
      retrySchedule: [10, 10]
    };
  }

  function makeItem(index: string): OsCommandItem {
    return {
      record: {
        PK: "T#root#CMS#CME#abc",
        SK: "L",
        TYPE: "cms.entry.l",
        GSI_TENANT: "root",
        data: { modelId: "test" }
      },
      metadata: { index, _ct: "2026-01-01T00:00:00Z", _md: "2026-01-01T00:00:00Z" },
      locale: "en-US"
    };
  }

  it("should create index when it does not exist", async () => {
    osClient.indices.exists.mockResolvedValue({ body: false });
    osClient.indices.create.mockResolvedValue({ body: {} });

    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], makeDeps());

    expect(osClient.indices.exists).toHaveBeenCalledWith({ index: "root-headless-cms-category" });
    expect(osClient.indices.create).toHaveBeenCalledTimes(1);
    const createCall = osClient.indices.create.mock.calls[0][0];
    expect(createCall.index).toBe("root-headless-cms-category");
    expect(createCall.body.settings.index.refresh_interval).toBe("-1");
    expect(createCall.body.mappings).toBeDefined();
  });

  it("should skip creation when index already exists", async () => {
    osClient.indices.exists.mockResolvedValue({ body: true });

    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], makeDeps());

    expect(osClient.indices.exists).toHaveBeenCalledTimes(1);
    expect(osClient.indices.create).not.toHaveBeenCalled();
  });

  it("should use cache and not check twice for same index", async () => {
    osClient.indices.exists.mockResolvedValue({ body: false });
    osClient.indices.create.mockResolvedValue({ body: {} });

    const deps = makeDeps();
    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], deps);
    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], deps);

    expect(osClient.indices.exists).toHaveBeenCalledTimes(1);
    expect(osClient.indices.create).toHaveBeenCalledTimes(1);
  });

  it("should handle resource_already_exists_exception silently", async () => {
    osClient.indices.exists.mockResolvedValue({ body: false });
    const error = new Error("resource_already_exists_exception");
    (error as any).meta = { body: { error: { type: "resource_already_exists_exception" } } };
    osClient.indices.create.mockRejectedValue(error);

    // Should not throw
    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], makeDeps());

    expect(osClient.indices.create).toHaveBeenCalledTimes(1);
  });

  it("should skip index creation when osClient is not provided", async () => {
    const batchPutSpy = vi.spyOn(database, "batchPut");
    const deps: OsExecutorDependencies = { database, targetTable: "target-os-table" };

    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], deps);

    // Should write records without index creation
    expect(batchPutSpy).toHaveBeenCalledTimes(1);
  });

  it("should handle multiple unique indexes in one batch", async () => {
    osClient.indices.exists.mockResolvedValue({ body: false });
    osClient.indices.create.mockResolvedValue({ body: {} });

    await executeOsCommands(
      [makeItem("root-headless-cms-en-us-category"), makeItem("root-headless-cms-en-us-article")],
      makeDeps()
    );

    expect(osClient.indices.exists).toHaveBeenCalledTimes(2);
    expect(osClient.indices.create).toHaveBeenCalledTimes(2);
  });

  it("should log error and continue when index creation fails after retries", async () => {
    const batchPutSpy = vi.spyOn(database, "batchPut");
    osClient.indices.exists.mockRejectedValue(new Error("cluster unhealthy"));

    // Should not throw — logs error and continues
    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], makeDeps());

    // Records should still be written
    expect(batchPutSpy).toHaveBeenCalledTimes(1);
  });
});
