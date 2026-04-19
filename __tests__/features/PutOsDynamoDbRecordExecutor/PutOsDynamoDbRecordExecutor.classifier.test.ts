import { describe, expect, it, vi } from "vitest";
import { PutOsDynamoDbRecordExecutor } from "~/features/PutOsDynamoDbRecordExecutor/abstractions/PutOsDynamoDbRecordExecutor.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { createOsContainer } from "../../containers/index.ts";
import { MockOpenSearchClient } from "../../services/OpenSearchClient/MockOpenSearchClient.ts";

const TABLE = "target-os";
const INDEX = "root-headless-cms-article";

function makePut(): PutRecord {
    return PutRecord.create({
        table: TABLE,
        record: {
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            _et: "CmsEntriesElasticsearch",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z",
            TYPE: "cms.entry.l",
            GSI_TENANT: "root",
            index: INDEX,
            data: { modelId: "article", values: {} }
        }
    });
}

interface DdbTuning {
    maxRetries?: number;
    initialBackoffMs?: number;
}

interface S3Tuning {
    concurrency?: number;
    maxRetries?: number;
    initialBackoffMs?: number;
}

interface OsTuning {
    maxRetries?: number;
    retryScheduleMs?: number[];
}

interface TuningShape {
    ddb?: DdbTuning;
    s3?: S3Tuning;
    os?: OsTuning;
}

interface MutableConfigCast {
    tuning?: TuningShape;
}

describe("PutOsDynamoDbRecordExecutor — classifier-gated retry", () => {
    it("fails fast on a non-retryable error without consuming the retry schedule", async () => {
        const container = createOsContainer();
        const executor = container.resolve(PutOsDynamoDbRecordExecutor);
        const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

        const nonRetryableError = Object.assign(new Error("bad mapping"), {
            name: "ValidationException"
        });
        const spy = vi.spyOn(osClient, "indexExists").mockRejectedValue(nonRetryableError);

        await expect(executor.execute([makePut()])).rejects.toThrow(/bad mapping/i);
        // indexExists was called exactly once — no retry happened.
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it("retries a retryable error up to schedule length, then throws", async () => {
        const container = createOsContainer();
        // Shrink the retry schedule BEFORE resolving the executor so the
        // singleton reads the small schedule.
        const config = container.resolve(MigrationConfig) as MigrationConfig.Interface &
            MutableConfigCast;
        config.tuning = { ...(config.tuning ?? {}), os: { retryScheduleMs: [5] } };

        const executor = container.resolve(PutOsDynamoDbRecordExecutor);
        const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

        const retryableError = Object.assign(new Error("slow down"), {
            name: "ThrottlingException"
        });
        const spy = vi.spyOn(osClient, "indexExists").mockRejectedValue(retryableError);

        await expect(executor.execute([makePut()])).rejects.toThrow(/slow down/i);
        // 1 initial + 1 retry = 2 total attempts.
        expect(spy).toHaveBeenCalledTimes(2);
        spy.mockRestore();
    });
});
