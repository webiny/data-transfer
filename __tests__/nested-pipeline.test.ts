import { describe, it, expect, beforeEach } from "vitest";
import { TransformPipeline } from "@/src/core/pipeline.ts";
import { Transformer } from "@/src/core/transformer.ts";
import { TransformContext, MigrationConfig } from "@/src/core/types.ts";
import { ModelProvider } from "@/src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";

describe("Nested Pipeline Execution", () => {
  let database: MockDatabaseClient;
  let config: MigrationConfig;
  let modelProvider: ModelProvider;

  beforeEach(() => {
    database = new MockDatabaseClient();
    modelProvider = new ModelProvider(database, "source-table");
    config = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider
    };
  });

  it("should execute nested pipeline on multiple records and merge commands", async () => {
    // Create a simple nested pipeline that adds a property
    const nestedTransformer: Transformer = {
      name: "addNestedFlag",
      transform(ctx: TransformContext) {
        ctx.record.nestedProcessed = true;
      }
    };

    const nestedPipeline = new TransformPipeline().use(nestedTransformer);

    // Create parent transformer that invokes nested pipeline
    const parentTransformer: Transformer = {
      name: "processRelatedRecords",
      async transform(ctx: TransformContext) {
        // Simulate finding related records
        const relatedRecords = [
          { PK: "RELATED#1", SK: "A", TYPE: "related", data: "record1" },
          { PK: "RELATED#2", SK: "A", TYPE: "related", data: "record2" }
        ];

        // Execute nested pipeline on related records
        const commands = await ctx.executePipeline(nestedPipeline, relatedRecords);

        // Verify commands were returned
        expect(commands.length).toBe(2);
        expect(commands[0].type).toBe("PUT_RECORD");
        expect(commands[1].type).toBe("PUT_RECORD");
      }
    };

    const parentPipeline = new TransformPipeline().use(parentTransformer);

    // Execute parent pipeline
    const parentRecord = { PK: "PARENT#1", SK: "A", TYPE: "parent" };
    const result = await parentPipeline.run(parentRecord, config, database);

    expect(result).toBeTruthy();

    // Parent pipeline should have 3 commands:
    // 1. The parent record itself
    // 2-3. The two related records from nested pipeline
    expect(result!.commands.length).toBe(3);

    // Verify parent record command
    const parentCommand = result!.commands[0];
    expect(parentCommand.type).toBe("PUT_RECORD");
    expect((parentCommand as any).record.PK).toBe("RELATED#1");

    // Verify nested records were processed with flag
    const nestedCommand1 = result!.commands[0];
    expect((nestedCommand1 as any).record.nestedProcessed).toBe(true);

    const nestedCommand2 = result!.commands[1];
    expect((nestedCommand2 as any).record.nestedProcessed).toBe(true);
  });

  it("should handle nested pipeline with S3 copy commands", async () => {
    // Nested pipeline that copies files
    const fileCopyTransformer: Transformer = {
      name: "copyFileMetadata",
      transform(ctx: TransformContext) {
        const fileKey = ctx.record.key as string;
        ctx.copyFile(fileKey, `migrated/${fileKey}`);
      }
    };

    const nestedPipeline = new TransformPipeline().use(fileCopyTransformer);

    // Parent transformer
    const parentTransformer: Transformer = {
      name: "processFileReferences",
      async transform(ctx: TransformContext) {
        const fileRecords = [
          { PK: "FILE#1", SK: "A", key: "file1.jpg" },
          { PK: "FILE#2", SK: "A", key: "file2.jpg" }
        ];

        await ctx.executePipeline(nestedPipeline, fileRecords);
      }
    };

    const parentPipeline = new TransformPipeline().use(parentTransformer);

    const parentRecord = { PK: "ENTRY#1", SK: "A", TYPE: "entry" };
    const result = await parentPipeline.run(parentRecord, config, database);

    expect(result).toBeTruthy();

    // Should have: 2 PUT_RECORD (files) + 2 S3_COPY + 1 PUT_RECORD (parent)
    expect(result!.commands.length).toBe(5);

    // Verify S3 copy commands exist
    const s3Commands = result!.commands.filter(cmd => cmd.type === "S3_COPY");
    expect(s3Commands.length).toBe(2);
    expect((s3Commands[0] as any).targetKey).toBe("migrated/file1.jpg");
    expect((s3Commands[1] as any).targetKey).toBe("migrated/file2.jpg");
  });

  it("should handle empty record array", async () => {
    const nestedPipeline = new TransformPipeline();

    const parentTransformer: Transformer = {
      name: "processNoRecords",
      async transform(ctx: TransformContext) {
        const commands = await ctx.executePipeline(nestedPipeline, []);
        expect(commands.length).toBe(0);
      }
    };

    const parentPipeline = new TransformPipeline().use(parentTransformer);

    const result = await parentPipeline.run({ PK: "TEST#1", SK: "A" }, config, database);

    // Only parent record command
    expect(result!.commands.length).toBe(1);
  });

  it("should skip records that don't match nested pipeline filters", async () => {
    // Nested pipeline with filter
    const nestedPipeline = new TransformPipeline()
      .filter(record => record.TYPE === "accepted")
      .use({
        name: "addFlag",
        transform(ctx: TransformContext) {
          ctx.record.processed = true;
        }
      });

    const parentTransformer: Transformer = {
      name: "processFiltered",
      async transform(ctx: TransformContext) {
        const records = [
          { PK: "REC#1", SK: "A", TYPE: "accepted" },
          { PK: "REC#2", SK: "A", TYPE: "rejected" },
          { PK: "REC#3", SK: "A", TYPE: "accepted" }
        ];

        const commands = await ctx.executePipeline(nestedPipeline, records);

        // Only 2 records should be processed (rejected is filtered out)
        expect(commands.length).toBe(2);
      }
    };

    const parentPipeline = new TransformPipeline().use(parentTransformer);

    const result = await parentPipeline.run({ PK: "PARENT#1", SK: "A" }, config, database);

    // Parent + 2 accepted nested records
    expect(result!.commands.length).toBe(3);
  });
});
