import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { v5UnknownRecord } from "./fixtures/v5-records.ts";

describe("Record Filtering", () => {
    it("should skip records without matching pipeline", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": [v5UnknownRecord as BaseRecord] }
        });
        const runner = container.resolve(PipelineRunner);
        v5ToV6Preset.configure(runner);

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        expect(targetDb.batchPutRecords).toHaveLength(0);
    });
});
