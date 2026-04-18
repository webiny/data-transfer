import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";

interface ModelField {
    fieldId: string;
    id: string;
    type: string;
    storageId?: string;
    helpText?: string | null;
    placeholderText?: string | null;
    note?: string | null;
    placeholder?: string | null;
    label?: string;
    description?: string;
    settings?: {
        fields?: ModelField[];
        templates?: Array<{
            id: string;
            name: string;
            fields?: ModelField[];
        }>;
    };
}

interface ModelRecord extends BaseRecord {
    modelId: string;
    tenant: string;
    locale: string;
    fields: ModelField[];
}

interface MigratedModel extends BaseRecord {
    data: {
        fields: ModelField[];
    };
}

function modelRecord(fields: ModelField[]): ModelRecord {
    return {
        PK: "T#root#L#en-US#CMS#CM",
        SK: "testModel",
        _et: "CmsModel",
        _ct: "2025-01-01T00:00:00.000Z",
        _md: "2025-01-01T00:00:00.000Z",
        TYPE: "cms.model",
        modelId: "testModel",
        tenant: "root",
        locale: "en-US",
        fields
    };
}

async function runModel(model: ModelRecord): Promise<MockDynamoDbClient> {
    const container = createDdbContainer({
        sourceRecords: { "source-table": [model as BaseRecord] }
    });
    const runner = container.resolve(PipelineRunner);
    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    v5ToV6Preset.configure(runner);

    await runner.run();
    return targetDb;
}

describe("CMS Model Field Attributes", () => {
    it("should rename helpText to description at field level", async () => {
        const targetDb = await runModel(
            modelRecord([
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: "Enter your title"
                }
            ])
        );

        const field = (targetDb.batchPutRecords[0] as MigratedModel).data.fields[0];
        expect(field.note).toBe("Enter your title");
        expect(field.helpText).toBeUndefined();
    });

    it("should rename placeholderText to placeholder at field level", async () => {
        const targetDb = await runModel(
            modelRecord([
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    placeholderText: "e.g. My Article"
                }
            ])
        );

        const field = (targetDb.batchPutRecords[0] as MigratedModel).data.fields[0];
        expect(field.placeholder).toBe("e.g. My Article");
        expect(field.placeholderText).toBeUndefined();
    });

    it("should rename both attributes simultaneously", async () => {
        const targetDb = await runModel(
            modelRecord([
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: "Enter your title",
                    placeholderText: "e.g. My Article"
                }
            ])
        );

        const field = (targetDb.batchPutRecords[0] as MigratedModel).data.fields[0];
        expect(field.note).toBe("Enter your title");
        expect(field.placeholder).toBe("e.g. My Article");
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
    });

    it("should rename attributes in object nested fields", async () => {
        const targetDb = await runModel(
            modelRecord([
                {
                    fieldId: "metadata",
                    id: "field2",
                    type: "object",
                    storageId: "object@field2",
                    settings: {
                        fields: [
                            {
                                fieldId: "author",
                                id: "field3",
                                type: "text",
                                storageId: "text@field3",
                                helpText: "Author name",
                                placeholderText: "John Doe"
                            }
                        ]
                    }
                }
            ])
        );

        const nestedField = (targetDb.batchPutRecords[0] as MigratedModel).data.fields[0].settings
            ?.fields?.[0];
        expect(nestedField).toBeDefined();
        const nested = nestedField as ModelField;
        expect(nested.note).toBe("Author name");
        expect(nested.placeholder).toBe("John Doe");
        expect(nested.helpText).toBeUndefined();
        expect(nested.placeholderText).toBeUndefined();
    });

    it("should rename attributes in dynamic zone template fields", async () => {
        const targetDb = await runModel(
            modelRecord([
                {
                    fieldId: "content",
                    id: "field4",
                    type: "dynamicZone",
                    storageId: "dynamicZone@field4",
                    settings: {
                        templates: [
                            {
                                id: "template1",
                                name: "Rich Text",
                                fields: [
                                    {
                                        fieldId: "text",
                                        id: "field5",
                                        type: "rich-text",
                                        storageId: "rich-text@field5",
                                        helpText: "Rich text content",
                                        placeholderText: "Start typing..."
                                    }
                                ]
                            }
                        ]
                    }
                }
            ])
        );

        const templateField = (targetDb.batchPutRecords[0] as MigratedModel).data.fields[0].settings
            ?.templates?.[0].fields?.[0];
        expect(templateField).toBeDefined();
        const tmpl = templateField as ModelField;
        expect(tmpl.note).toBe("Rich text content");
        expect(tmpl.placeholder).toBe("Start typing...");
        expect(tmpl.helpText).toBeUndefined();
        expect(tmpl.placeholderText).toBeUndefined();
    });

    it("should handle deeply nested fields (object in dynamic zone)", async () => {
        const targetDb = await runModel(
            modelRecord([
                {
                    fieldId: "content",
                    id: "field1",
                    type: "dynamicZone",
                    storageId: "dynamicZone@field1",
                    settings: {
                        templates: [
                            {
                                id: "template1",
                                name: "Card",
                                fields: [
                                    {
                                        fieldId: "cardData",
                                        id: "field2",
                                        type: "object",
                                        storageId: "object@field2",
                                        settings: {
                                            fields: [
                                                {
                                                    fieldId: "cardTitle",
                                                    id: "field3",
                                                    type: "text",
                                                    storageId: "text@field3",
                                                    helpText: "Card title text",
                                                    placeholderText: "Enter title"
                                                }
                                            ]
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ])
        );

        const deeplyNestedField = (targetDb.batchPutRecords[0] as MigratedModel).data.fields[0]
            .settings?.templates?.[0].fields?.[0].settings?.fields?.[0];
        expect(deeplyNestedField).toBeDefined();
        const deep = deeplyNestedField as ModelField;
        expect(deep.note).toBe("Card title text");
        expect(deep.placeholder).toBe("Enter title");
        expect(deep.helpText).toBeUndefined();
        expect(deep.placeholderText).toBeUndefined();
    });

    it("should preserve existing description/placeholder if already present", async () => {
        const targetDb = await runModel(
            modelRecord([
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: "Old help text",
                    placeholderText: "Old placeholder"
                }
            ])
        );

        const field = (targetDb.batchPutRecords[0] as MigratedModel).data.fields[0];
        expect(field.note).toBe("Old help text");
        expect(field.placeholder).toBe("Old placeholder");
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
    });

    it("should handle null values correctly", async () => {
        const targetDb = await runModel(
            modelRecord([
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: null,
                    placeholderText: null
                }
            ])
        );

        const field = (targetDb.batchPutRecords[0] as MigratedModel).data.fields[0];
        expect(field.note).toBeNull();
        expect(field.placeholder).toBeNull();
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
    });

    it("should handle fields without the attributes (no-op)", async () => {
        const targetDb = await runModel(
            modelRecord([
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    label: "Title"
                }
            ])
        );

        const field = (targetDb.batchPutRecords[0] as MigratedModel).data.fields[0];
        expect(field.description).toBeUndefined();
        expect(field.placeholder).toBeUndefined();
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
        expect(field.label).toBe("Title");
    });

    it("should handle empty fields array", async () => {
        const targetDb = await runModel(modelRecord([]));
        expect((targetDb.batchPutRecords[0] as MigratedModel).data.fields).toEqual([]);
    });

    it("should be idempotent (running twice produces same result)", async () => {
        const firstTargetDb = await runModel(
            modelRecord([
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: "Enter your title",
                    placeholderText: "e.g. My Article"
                }
            ])
        );
        const firstResult = firstTargetDb.batchPutRecords[0] as MigratedModel;

        // Feed the already-migrated record back through the preset as a new scan.
        const alreadyMigrated = JSON.parse(JSON.stringify(firstResult)) as BaseRecord;
        const secondContainer = createDdbContainer({
            sourceRecords: { "source-table": [alreadyMigrated] }
        });
        const secondRunner = secondContainer.resolve(PipelineRunner);
        const secondTargetDb = secondContainer.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(secondRunner);
        await secondRunner.run();

        const secondResult = secondTargetDb.batchPutRecords[0] as MigratedModel;
        expect(secondResult.data.fields[0].note).toBe("Enter your title");
        expect(secondResult.data.fields[0].placeholder).toBe("e.g. My Article");
        expect(secondResult.data.fields[0].helpText).toBeUndefined();
        expect(secondResult.data.fields[0].placeholderText).toBeUndefined();
    });
});
