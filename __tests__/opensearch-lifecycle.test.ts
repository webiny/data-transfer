import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    OpenSearchBeforeMigration,
    OpenSearchAfterMigration
} from "../src/opensearch/lifecycle.ts";

function createMockClient() {
    return {
        cat: {
            indices: vi.fn()
        },
        indices: {
            putSettings: vi.fn()
        }
    } as any;
}

describe("OpenSearchBeforeMigration", () => {
    let client: ReturnType<typeof createMockClient>;

    beforeEach(() => {
        client = createMockClient();
    });

    it("should disable refresh on all existing indexes", async () => {
        client.cat.indices.mockResolvedValue({
            body: [{ index: "root-en-us-cms-entries" }, { index: "root-en-us-fm-files" }]
        });

        client.indices.putSettings.mockResolvedValue({ body: {} });

        const hook = new OpenSearchBeforeMigration(client);
        await hook.execute();

        expect(client.indices.putSettings).toHaveBeenCalledTimes(2);

        expect(client.indices.putSettings).toHaveBeenCalledWith({
            index: "root-en-us-cms-entries",
            body: { index: { refresh_interval: "-1" } }
        });

        expect(client.indices.putSettings).toHaveBeenCalledWith({
            index: "root-en-us-fm-files",
            body: { index: { refresh_interval: "-1" } }
        });
    });

    it("should handle cluster with no indexes", async () => {
        client.cat.indices.mockResolvedValue({ body: [] });

        const hook = new OpenSearchBeforeMigration(client);
        await hook.execute();

        expect(client.indices.putSettings).not.toHaveBeenCalled();
    });

    it("should skip system indexes", async () => {
        client.cat.indices.mockResolvedValue({
            body: [
                { index: ".kibana" },
                { index: ".opendistro_security" },
                { index: "root-en-us-cms-entries" }
            ]
        });

        client.indices.putSettings.mockResolvedValue({ body: {} });

        const hook = new OpenSearchBeforeMigration(client);
        await hook.execute();

        expect(client.indices.putSettings).toHaveBeenCalledTimes(1);
        expect(client.indices.putSettings).toHaveBeenCalledWith({
            index: "root-en-us-cms-entries",
            body: { index: { refresh_interval: "-1" } }
        });
    });

    it("should continue if putSettings fails on one index", async () => {
        client.cat.indices.mockResolvedValue({
            body: [{ index: "root-en-us-cms-entries" }, { index: "root-en-us-fm-files" }]
        });

        client.indices.putSettings
            .mockRejectedValueOnce(new Error("read-only index"))
            .mockResolvedValueOnce({ body: {} });

        const hook = new OpenSearchBeforeMigration(client);
        await hook.execute();

        expect(client.indices.putSettings).toHaveBeenCalledTimes(2);
    });
});

describe("OpenSearchAfterMigration", () => {
    let client: ReturnType<typeof createMockClient>;

    beforeEach(() => {
        client = createMockClient();
    });

    it("should enable refresh on all indexes", async () => {
        client.cat.indices.mockResolvedValue({
            body: [{ index: "root-en-us-cms-entries" }, { index: "root-en-us-fm-files" }]
        });

        client.indices.putSettings.mockResolvedValue({ body: {} });

        const hook = new OpenSearchAfterMigration(client);
        await hook.execute();

        expect(client.indices.putSettings).toHaveBeenCalledTimes(2);

        expect(client.indices.putSettings).toHaveBeenCalledWith({
            index: "root-en-us-cms-entries",
            body: { index: { refresh_interval: "1s" } }
        });

        expect(client.indices.putSettings).toHaveBeenCalledWith({
            index: "root-en-us-fm-files",
            body: { index: { refresh_interval: "1s" } }
        });
    });

    it("should handle cluster with no indexes", async () => {
        client.cat.indices.mockResolvedValue({ body: [] });

        const hook = new OpenSearchAfterMigration(client);
        await hook.execute();

        expect(client.indices.putSettings).not.toHaveBeenCalled();
    });

    it("should skip system indexes", async () => {
        client.cat.indices.mockResolvedValue({
            body: [{ index: ".kibana" }, { index: "root-en-us-cms-entries" }]
        });

        client.indices.putSettings.mockResolvedValue({ body: {} });

        const hook = new OpenSearchAfterMigration(client);
        await hook.execute();

        expect(client.indices.putSettings).toHaveBeenCalledTimes(1);
        expect(client.indices.putSettings).toHaveBeenCalledWith({
            index: "root-en-us-cms-entries",
            body: { index: { refresh_interval: "1s" } }
        });
    });
});
