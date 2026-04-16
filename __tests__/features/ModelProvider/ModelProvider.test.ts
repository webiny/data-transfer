import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Container } from "@webiny/di";
import { ModelProvider, ModelProviderFeature } from "../../../src/features/ModelProvider/index.ts";
import { SourceDynamoDbClient } from "../../../src/features/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MigrationConfig } from "../../../src/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { LoggerFeature } from "../../../src/features/Logger/index.ts";
import { MockDynamoDbClient } from "../DynamoDbClient/MockDynamoDbClient.ts";

function createContainer(database: MockDynamoDbClient, modelsDir?: string): Container {
    const container = new Container();
    LoggerFeature.register(container, { logLevel: "error", json: false });
    container.registerInstance(SourceDynamoDbClient, database);
    container.registerInstance(MigrationConfig, {
        storage: "ddb",
        source: {
            region: "us-east-1",
            credentials: { accessKeyId: "test", secretAccessKey: "test" },
            dynamodb: { tableName: "source-table" },
            s3: { bucket: "bucket" }
        },
        target: {
            region: "us-east-1",
            credentials: { accessKeyId: "test", secretAccessKey: "test" },
            dynamodb: { tableName: "target-table" },
            s3: { bucket: "bucket" }
        },
        pipeline: { preset: "v5-to-v6", modelsDir }
    } as MigrationConfig.Interface);
    ModelProviderFeature.register(container);
    return container;
}

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

            const container = createContainer(database);
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(2);
            expect(provider.getModel("category")).toBeDefined();
            expect(provider.getModel("category")!.name).toBe("Category");
            expect(provider.getModel("article")).toBeDefined();
        });

        it("should return undefined for unknown model", async () => {
            const database = new MockDynamoDbClient();
            const container = createContainer(database);
            const provider = container.resolve(ModelProvider);
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

            const container = createContainer(database);
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(1);
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

            const container = createContainer(database);
            const provider = container.resolve(ModelProvider);
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
            const container = createContainer(database, tmpDir);
            const provider = container.resolve(ModelProvider);
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

            const container = createContainer(database, tmpDir);
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModel("category")!.name).toBe("Category from JSON");

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("should skip files without modelId", async () => {
            writeFileSync(
                join(tmpDir, "bad.json"),
                JSON.stringify({ name: "No modelId", fields: [] })
            );

            const database = new MockDynamoDbClient();
            const container = createContainer(database, tmpDir);
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(0);

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("should skip non-JSON files", async () => {
            writeFileSync(join(tmpDir, "readme.txt"), "not a model");

            const database = new MockDynamoDbClient();
            const container = createContainer(database, tmpDir);
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(0);

            rmSync(tmpDir, { recursive: true, force: true });
        });
    });

    describe("DI registration", () => {
        it("should resolve from container", () => {
            const database = new MockDynamoDbClient();
            const container = createContainer(database);
            const resolved = container.resolve(ModelProvider);
            expect(resolved).toBeDefined();
            expect(typeof resolved.preloadModels).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const database = new MockDynamoDbClient();
            const container = createContainer(database);
            const first = container.resolve(ModelProvider);
            const second = container.resolve(ModelProvider);
            expect(first).toBe(second);
        });
    });
});
