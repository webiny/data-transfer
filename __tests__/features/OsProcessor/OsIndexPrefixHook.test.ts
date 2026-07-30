import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOsContainer } from "../../containers/index.ts";
import { BeforeTransferHook } from "~/features/TransferLifecycle/index.js";

describe("OsIndexPrefixHook", () => {
    let savedPrefix: string | undefined;

    beforeEach(() => {
        savedPrefix = process.env.OPENSEARCH_INDEX_PREFIX;
    });

    afterEach(() => {
        if (savedPrefix === undefined) {
            delete process.env.OPENSEARCH_INDEX_PREFIX;
        } else {
            process.env.OPENSEARCH_INDEX_PREFIX = savedPrefix;
        }
    });

    it("sets OPENSEARCH_INDEX_PREFIX to the configured target prefix", async () => {
        const container = createOsContainer({ indexPrefix: "tenant-" });
        const hook = container.resolve(BeforeTransferHook);
        await hook.execute();
        expect(process.env.OPENSEARCH_INDEX_PREFIX).toBe("tenant-");
    });

    it("sets OPENSEARCH_INDEX_PREFIX to empty string when prefix is empty", async () => {
        const container = createOsContainer({ indexPrefix: "" });
        const hook = container.resolve(BeforeTransferHook);
        await hook.execute();
        expect(process.env.OPENSEARCH_INDEX_PREFIX).toBe("");
    });

    it("does not set OPENSEARCH_INDEX_PREFIX when OpenSearch is not configured", async () => {
        delete process.env.OPENSEARCH_INDEX_PREFIX;
        const container = createOsContainer({ noOpenSearch: true });
        const hook = container.resolve(BeforeTransferHook);
        await hook.execute();
        expect(process.env.OPENSEARCH_INDEX_PREFIX).toBeUndefined();
    });
});
