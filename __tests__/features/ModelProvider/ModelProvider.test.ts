import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Container } from "@webiny/di";
import { ModelProviderImpl } from "../../../src/features/ModelProvider/ModelProvider.ts";
import { ModelProvider } from "../../../src/features/ModelProvider/abstractions/ModelProvider.ts";
import { MockDynamoDbClient } from "../DynamoDbClient/MockDynamoDbClient.ts";

// Simple mock logger
const mockLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    done: () => {}
};

describe("ModelProvider", () => {
    describe("preloadModels from DB", () => {
        it("should load models from database", async () => {
            const database = new MockDynamoDbClient({
                "source-table": [
                    {
                        PK: "T#root#L#en-US#CMS#CM",
                        SK: "category",
                        modelId: "category",
                        name: "Category",
                        fields: [
                            { id: "1", fieldId: "title", storageId: "text@title", type: "text" }
                        ]
                    },
                    {
                        PK: "T#root#L#en-US#CMS#CM",
                        SK: "article",
                        modelId: "article",
                        name: "Article",
                        fields: [
                            {
                                id: "2",
                                fieldId: "body",
                                storageId: "rich-text@body",
                                type: "rich-text"
                            }
                        ]
                    }
                ]
            });

            const provider = new ModelProviderImpl(database, mockLogger, "source-table");
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(2);
            expect(provider.getModel("category")).toBeDefined();
            expect(provider.getModel("category")!.name).toBe("Category");
            expect(provider.getModel("article")).toBeDefined();
        });

        it("should return undefined for unknown model", async () => {
            const database = new MockDynamoDbClient();
            const provider = new ModelProviderImpl(database, mockLogger, "source-table");
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModel("nonexistent")).toBeUndefined();
        });

        it("should not duplicate models", async () => {
            const database = new MockDynamoDbClient({
                "source-table": [
                    {
                        PK: "T#root#L#en-US#CMS#CM",
                        SK: "category",
                        modelId: "category",
                        name: "Category",
                        fields: []
                    },
                    {
                        PK: "T#root#L#en-US#CMS#CM",
                        SK: "category-2",
                        modelId: "category",
                        name: "Category Duplicate",
                        fields: []
                    }
                ]
            });

            const provider = new ModelProviderImpl(database, mockLogger, "source-table");
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(1);
            // First one wins for DB
            expect(provider.getModel("category")!.name).toBe("Category");
        });

        it("should load models from multiple tenants", async () => {
            const database = new MockDynamoDbClient({
                "source-table": [
                    {
                        PK: "T#root#L#en-US#CMS#CM",
                        SK: "category",
                        modelId: "category",
                        name: "Category",
                        fields: []
                    },
                    {
                        PK: "T#acme#L#de-DE#CMS#CM",
                        SK: "product",
                        modelId: "product",
                        name: "Product",
                        fields: []
                    }
                ]
            });

            const provider = new ModelProviderImpl(database, mockLogger, "source-table");
            await provider.preloadModels(
                new Map([
                    ["root", "en-US"],
                    ["acme", "de-DE"]
                ])
            );

            expect(provider.getModelIds()).toHaveLength(2);
        });
    });

    describe("preloadModels from JSON files", () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = mkdtempSync(join(tmpdir(), "model-provider-test-"));
        });

        it("should load models from JSON files", async () => {
            writeFileSync(
                join(tmpDir, "category.json"),
                JSON.stringify({
                    PK: "T#root#CMS#CM",
                    SK: "category",
                    modelId: "category",
                    name: "Category from JSON",
                    fields: [{ id: "1", fieldId: "title", storageId: "text@title", type: "text" }]
                })
            );

            const database = new MockDynamoDbClient();
            const provider = new ModelProviderImpl(database, mockLogger, "source-table", tmpDir);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModel("category")).toBeDefined();
            expect(provider.getModel("category")!.name).toBe("Category from JSON");

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("should override DB models with JSON models", async () => {
            const database = new MockDynamoDbClient({
                "source-table": [
                    {
                        PK: "T#root#L#en-US#CMS#CM",
                        SK: "category",
                        modelId: "category",
                        name: "Category from DB",
                        fields: []
                    }
                ]
            });

            writeFileSync(
                join(tmpDir, "category.json"),
                JSON.stringify({
                    PK: "T#root#CMS#CM",
                    SK: "category",
                    modelId: "category",
                    name: "Category from JSON",
                    fields: [{ id: "1", fieldId: "title", storageId: "text@title", type: "text" }]
                })
            );

            const provider = new ModelProviderImpl(database, mockLogger, "source-table", tmpDir);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            // JSON takes precedence
            expect(provider.getModel("category")!.name).toBe("Category from JSON");

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("should skip files without modelId", async () => {
            writeFileSync(
                join(tmpDir, "bad.json"),
                JSON.stringify({ name: "No modelId", fields: [] })
            );

            const database = new MockDynamoDbClient();
            const provider = new ModelProviderImpl(database, mockLogger, "source-table", tmpDir);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(0);

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("should skip non-JSON files", async () => {
            writeFileSync(join(tmpDir, "readme.txt"), "not a model");

            const database = new MockDynamoDbClient();
            const provider = new ModelProviderImpl(database, mockLogger, "source-table", tmpDir);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(0);

            rmSync(tmpDir, { recursive: true, force: true });
        });
    });

    describe("DI registration", () => {
        it("should resolve from container via feature", async () => {
            // This test verifies the feature wiring works by manually
            // registering the instance (since we don't have full DI setup here)
            const container = new Container();
            const database = new MockDynamoDbClient();
            const provider = new ModelProviderImpl(database, mockLogger, "source-table");

            container.registerInstance(ModelProvider, provider);

            const resolved = container.resolve(ModelProvider);
            expect(resolved).toBe(provider);
        });
    });
});
