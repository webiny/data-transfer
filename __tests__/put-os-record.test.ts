import { describe, it, expect } from "vitest";
import { createContext } from "../src/core/context.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";

describe("putOsRecord", () => {
  const database = new MockDatabaseClient();
  const modelProvider = new ModelProvider(database, "source-table");

  it("should emit a PUT_RECORD command targeting the OS table", () => {
    const config: MigrationConfig = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider,
      opensearch: {
        endpoint: "https://es.example.com",
        targetTable: "target-os-table",
        sourceTable: "source-os-table"
      }
    };

    const record = { PK: "T#root#CMS#CME#abc", SK: "REV#0001", TYPE: "cms.entry" };
    const ctx = createContext(record, config, database);

    ctx.putOsRecord({ PK: "OS#abc", SK: "A", data: { test: true } });

    expect(ctx.commands).toHaveLength(1);
    expect(ctx.commands[0]).toEqual({
      type: "PUT_RECORD",
      table: "target-os-table",
      record: { PK: "OS#abc", SK: "A", data: { test: true } }
    });
  });

  it("should throw when opensearch is not configured", () => {
    const config: MigrationConfig = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider
    };

    const record = { PK: "T#root#CMS#CME#abc", SK: "REV#0001", TYPE: "cms.entry" };
    const ctx = createContext(record, config, database);

    expect(() => ctx.putOsRecord({ PK: "OS#abc", SK: "A" })).toThrow("opensearch");
  });

  it("should allow mixing putPrimaryRecord and putOsRecord commands", () => {
    const config: MigrationConfig = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider,
      opensearch: {
        endpoint: "https://es.example.com",
        targetTable: "target-os-table",
        sourceTable: "source-os-table"
      }
    };

    const record = { PK: "T#root#CMS#CME#abc", SK: "REV#0001", TYPE: "cms.entry" };
    const ctx = createContext(record, config, database);

    ctx.putPrimaryRecord({ PK: "NEW#abc", SK: "A", data: {} });
    ctx.putOsRecord({ PK: "OS#abc", SK: "A", data: {} });

    expect(ctx.commands).toHaveLength(2);
    expect(ctx.commands[0]).toHaveProperty("table", "target-table");
    expect(ctx.commands[1]).toHaveProperty("table", "target-os-table");
  });
});
