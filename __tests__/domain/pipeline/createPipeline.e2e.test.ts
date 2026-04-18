import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

describe("createPipeline — implementation-class tokens", () => {
    it("accepts DdbScanner/DdbProcessor impl classes, resolves via container at run time", async () => {
        const record: BaseRecord = {
            PK: "T#root#TAG#x",
            SK: "A",
            TYPE: "test.tag",
            _et: "Tag",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        };
        const container = createDdbContainer({
            sourceRecords: { "source-table": [record] }
        });
        const runner = container.resolve(PipelineRunner);
        const tagTransformer = createTransformer<BaseTransformContext.Interface>("tag", ctx => {
            (ctx.record as BaseRecord & { tagged?: boolean }).tagged = true;
        });
        const testPipeline = createDdbPipeline("test-tag", builder => {
            builder
                .filter(createFilter<BaseRecord>(r => r.TYPE === "test.tag"))
                .use(tagTransformer);
        });
        testPipeline.register(runner, DdbScanner, DdbProcessor);
        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        expect(targetDb.batchPutRecords).toHaveLength(1);
        expect((targetDb.batchPutRecords[0] as BaseRecord & { tagged?: boolean }).tagged).toBe(
            true
        );
    });
});
