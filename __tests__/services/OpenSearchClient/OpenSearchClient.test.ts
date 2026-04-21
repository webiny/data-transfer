import { describe, it, expect, beforeEach } from "vitest";
import { OpenSearchClient } from "../../../src/services/OpenSearchClient/index.ts";
import { MockOpenSearchClient } from "./MockOpenSearchClient.ts";
import { createOsContainer } from "../../containers/index.ts";

describe("OpenSearchClient Feature", () => {
    describe("DI registration", () => {
        it("should resolve client from container", () => {
            const container = createOsContainer();
            const client = container.resolve(OpenSearchClient);
            expect(client).toBeDefined();
        });

        it("should resolve same instance on multiple resolves", () => {
            const container = createOsContainer();
            expect(container.resolve(OpenSearchClient)).toBe(container.resolve(OpenSearchClient));
        });
    });

    describe("MockOpenSearchClient", () => {
        let client: MockOpenSearchClient;

        beforeEach(() => {
            client = new MockOpenSearchClient();
        });

        it("should create an index", async () => {
            await client.createIndex("test-index", {
                mappings: { dynamic_templates: [] },
                settings: { index: { refresh_interval: "-1" } }
            });

            expect(await client.indexExists("test-index")).toBe(true);
            expect(client.getIndexCount()).toBe(1);
        });

        it("should throw on duplicate index creation", async () => {
            await client.createIndex("test-index");

            await expect(client.createIndex("test-index")).rejects.toThrow(
                "resource_already_exists_exception"
            );
        });

        it("should report non-existent index", async () => {
            expect(await client.indexExists("nonexistent")).toBe(false);
        });

        it("should list all indexes", async () => {
            await client.createIndex("index-a");
            await client.createIndex("index-b");

            const indexes = await client.listIndexes();
            const names = indexes.map(i => i.index);

            expect(names).toContain("index-a");
            expect(names).toContain("index-b");
            expect(indexes).toHaveLength(2);
        });

        it("should list empty when no indexes", async () => {
            const indexes = await client.listIndexes();
            expect(indexes).toHaveLength(0);
        });

        it("should put index settings", async () => {
            await client.createIndex("test-index");
            await client.putIndexSettings("test-index", {
                index: { refresh_interval: "1s" }
            });

            const settings = client.peekSettings("test-index");
            expect(settings).toEqual({ refresh_interval: "1s" });
        });

        it("should throw when putting settings on non-existent index", async () => {
            await expect(
                client.putIndexSettings("nonexistent", { index: { refresh_interval: "1s" } })
            ).rejects.toThrow("index_not_found");
        });

        it("should clear all indexes", async () => {
            await client.createIndex("index-a");
            await client.createIndex("index-b");

            client.clear();

            expect(client.getIndexCount()).toBe(0);
        });
    });
});
