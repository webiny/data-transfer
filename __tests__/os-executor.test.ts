import { describe, it, expect, vi } from "vitest";
import { executeOsCommands, type OsCommandItem } from "../src/opensearch/executor.ts";
import { GzipCompression } from "../src/utils/gzip-compression.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";

const gzip = new GzipCompression();

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
        metadata: { index: "root-headless-cms-en-us-category", _ct: "2026-01-01T00:00:00Z", _md: "2026-01-01T00:00:00Z" },
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
        metadata: { index: "root-headless-cms-en-us-article", _ct: "2026-01-02T00:00:00Z", _md: "2026-01-02T00:00:00Z" },
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
