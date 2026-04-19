import { describe, it, expect, vi } from "vitest";
import { OsCommandExecutor } from "~/features/OsCommandExecutor/index.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import type { OsRecord } from "~/features/OsScanner/abstractions/OsScanner.ts";
import { createOsContainer } from "../../containers/index.ts";
import { MockOpenSearchClient } from "../../services/OpenSearchClient/MockOpenSearchClient.ts";

function makeRecord(): OsRecord {
    return {
        PK: "T#root#CMS#CME#abc",
        SK: "L",
        _et: "CmsEntriesElasticsearch",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "cms.entry.l",
        GSI_TENANT: "root",
        index: "root-headless-cms-article",
        data: { modelId: "article", values: {} }
    };
}

describe("OsCommandExecutor — classifier-gated retry", () => {
    it("fails fast on a non-retryable error without consuming the retry schedule", async () => {
        const container = createOsContainer();
        const executor = container.resolve(OsCommandExecutor);
        const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;

        const nonRetryableError = Object.assign(new Error("bad mapping"), {
            name: "ValidationException"
        });
        const spy = vi.spyOn(osClient, "indexExists").mockRejectedValue(nonRetryableError);

        await expect(executor.execute([makeRecord()], new Map())).rejects.toThrow(/bad mapping/i);
        // indexExists was called exactly once — no retry happened.
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});
