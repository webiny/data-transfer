import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ModelProvider } from "../../../src/features/ModelProvider/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

describe("ModelProvider", () => {
    describe("preloadModels from DB", () => {
        it("should load models from database", async () => {
            const container = createDdbContainer({
                sourceRecords: {
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
                }
            });

            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(2);
            expect(provider.getModel("category")).toBeDefined();
            expect(provider.getModel("category")!.name).toBe("Category");
            expect(provider.getModel("article")).toBeDefined();
        });

        it("should return undefined for unknown model", async () => {
            const container = createDdbContainer();
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModel("nonexistent")).toBeUndefined();
        });

        it("should not duplicate models", async () => {
            const container = createDdbContainer({
                sourceRecords: {
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
                }
            });

            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(1);
            expect(provider.getModel("category")!.name).toBe("Category");
        });

        it("should load models from multiple tenants", async () => {
            const container = createDdbContainer({
                sourceRecords: {
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
                }
            });

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

            const container = createDdbContainer({ modelsDir: tmpDir });
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModel("category")).toBeDefined();
            expect(provider.getModel("category")!.name).toBe("Category from JSON");

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("should override DB models with JSON models", async () => {
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

            const container = createDdbContainer({
                sourceRecords: {
                    "source-table": [
                        {
                            PK: "T#root#L#en-US#CMS#CM",
                            SK: "category",
                            modelId: "category",
                            name: "Category from DB",
                            fields: []
                        }
                    ]
                },
                modelsDir: tmpDir
            });

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

            const container = createDdbContainer({ modelsDir: tmpDir });
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(0);

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("loads webiny-partner.json from __tests__/data", async () => {
            const dataDir = fileURLToPath(new URL("../../data", import.meta.url));
            const container = createDdbContainer({ modelsDir: dataDir });
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map());

            const model = provider.getModel("partner");
            expect(model).toBeDefined();
            expect(model!.name).toBe("Partner");
            expect(model!.fields.length).toBeGreaterThan(0);
        });

        it("loads all models from a root-level array", async () => {
            writeFileSync(
                join(tmpDir, "models.json"),
                JSON.stringify([
                    { modelId: "article", name: "Article", fields: [] },
                    { modelId: "author", name: "Author", fields: [] }
                ])
            );

            const container = createDdbContainer({ modelsDir: tmpDir });
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map());

            expect(provider.getModel("article")).toBeDefined();
            expect(provider.getModel("author")).toBeDefined();
            expect(provider.getModelIds()).toHaveLength(2);

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("loads models from a Webiny export {groups, models} file", async () => {
            writeFileSync(
                join(tmpDir, "export.json"),
                JSON.stringify({
                    groups: [{ id: "g1", name: "Blog", slug: "blog", icon: "fas/blog" }],
                    models: [
                        { modelId: "post", name: "Post", fields: [] },
                        { modelId: "tag", name: "Tag", fields: [] }
                    ]
                })
            );

            const container = createDdbContainer({ modelsDir: tmpDir });
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map());

            expect(provider.getModel("post")).toBeDefined();
            expect(provider.getModel("tag")).toBeDefined();
            expect(provider.getModelIds()).toHaveLength(2);

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("loads models from webiny-v5-website.json (real export format)", async () => {
            const dataDir = fileURLToPath(new URL("../../data", import.meta.url));
            const container = createDdbContainer({ modelsDir: dataDir });
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map());

            expect(provider.getModel("author")).toBeDefined();
            expect(provider.getModel("blog")).toBeDefined();
            expect(provider.getModel("partner")).toBeDefined();
            expect(provider.getModelIds().length).toBeGreaterThanOrEqual(7);
        });

        it("skips non-model entries in a root-level array", async () => {
            writeFileSync(
                join(tmpDir, "mixed.json"),
                JSON.stringify([
                    { modelId: "article", name: "Article", fields: [] },
                    { name: "Not a model" },
                    null
                ])
            );

            const container = createDdbContainer({ modelsDir: tmpDir });
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map());

            expect(provider.getModelIds()).toHaveLength(1);
            expect(provider.getModel("article")).toBeDefined();

            rmSync(tmpDir, { recursive: true, force: true });
        });

        it("should skip non-JSON files", async () => {
            writeFileSync(join(tmpDir, "readme.txt"), "not a model");

            const container = createDdbContainer({ modelsDir: tmpDir });
            const provider = container.resolve(ModelProvider);
            await provider.preloadModels(new Map([["root", "en-US"]]));

            expect(provider.getModelIds()).toHaveLength(0);

            rmSync(tmpDir, { recursive: true, force: true });
        });
    });

    describe("DI registration", () => {
        it("should resolve from container", () => {
            const container = createDdbContainer();
            const resolved = container.resolve(ModelProvider);
            expect(resolved).toBeDefined();
            expect(typeof resolved.preloadModels).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(ModelProvider)).toBe(container.resolve(ModelProvider));
        });
    });
});
