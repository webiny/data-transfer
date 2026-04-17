import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";

function modelRecord(fields: any[]): any {
    return {
        PK: "T#root#L#en-US#CMS#CM",
        SK: "testModel",
        TYPE: "cms.model",
        modelId: "testModel",
        tenant: "root",
        locale: "en-US",
        fields
    };
}

async function runModel(model: any) {
    const container = createDdbContainer();
    const runner = container.resolve(PipelineRunner);
    const executor = container.resolve(DdbCommandExecutor);
    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    v5ToV6Preset.configure(runner);

    const commands = await runner.processRecord(model);
    await executor.execute(commands);
    return { targetDb, runner, executor };
}

describe("CMS Model Field Attributes", () => {
    it("should rename helpText to description at field level", async () => {
        const { targetDb } = await runModel(
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

        const field = (targetDb.batchPutRecords[0] as any).data.fields[0];
        expect(field.note).toBe("Enter your title");
        expect(field.helpText).toBeUndefined();
    });

    it("should rename placeholderText to placeholder at field level", async () => {
        const { targetDb } = await runModel(
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

        const field = (targetDb.batchPutRecords[0] as any).data.fields[0];
        expect(field.placeholder).toBe("e.g. My Article");
        expect(field.placeholderText).toBeUndefined();
    });

    it("should rename both attributes simultaneously", async () => {
        const { targetDb } = await runModel(
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

        const field = (targetDb.batchPutRecords[0] as any).data.fields[0];
        expect(field.note).toBe("Enter your title");
        expect(field.placeholder).toBe("e.g. My Article");
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
    });

    it("should rename attributes in object nested fields", async () => {
        const { targetDb } = await runModel(
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

        const nestedField = (targetDb.batchPutRecords[0] as any).data.fields[0].settings.fields[0];
        expect(nestedField.note).toBe("Author name");
        expect(nestedField.placeholder).toBe("John Doe");
        expect(nestedField.helpText).toBeUndefined();
        expect(nestedField.placeholderText).toBeUndefined();
    });

    it("should rename attributes in dynamic zone template fields", async () => {
        const { targetDb } = await runModel(
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

        const templateField = (targetDb.batchPutRecords[0] as any).data.fields[0].settings
            .templates[0].fields[0];
        expect(templateField.note).toBe("Rich text content");
        expect(templateField.placeholder).toBe("Start typing...");
        expect(templateField.helpText).toBeUndefined();
        expect(templateField.placeholderText).toBeUndefined();
    });

    it("should handle deeply nested fields (object in dynamic zone)", async () => {
        const { targetDb } = await runModel(
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

        const deeplyNestedField = (targetDb.batchPutRecords[0] as any).data.fields[0].settings
            .templates[0].fields[0].settings.fields[0];
        expect(deeplyNestedField.note).toBe("Card title text");
        expect(deeplyNestedField.placeholder).toBe("Enter title");
        expect(deeplyNestedField.helpText).toBeUndefined();
        expect(deeplyNestedField.placeholderText).toBeUndefined();
    });

    it("should preserve existing description/placeholder if already present", async () => {
        const { targetDb } = await runModel(
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

        const field = (targetDb.batchPutRecords[0] as any).data.fields[0];
        expect(field.note).toBe("Old help text");
        expect(field.placeholder).toBe("Old placeholder");
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
    });

    it("should handle null values correctly", async () => {
        const { targetDb } = await runModel(
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

        const field = (targetDb.batchPutRecords[0] as any).data.fields[0];
        expect(field.note).toBeNull();
        expect(field.placeholder).toBeNull();
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
    });

    it("should handle fields without the attributes (no-op)", async () => {
        const { targetDb } = await runModel(
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

        const field = (targetDb.batchPutRecords[0] as any).data.fields[0];
        expect(field.description).toBeUndefined();
        expect(field.placeholder).toBeUndefined();
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
        expect(field.label).toBe("Title");
    });

    it("should handle empty fields array", async () => {
        const { targetDb } = await runModel(modelRecord([]));
        expect((targetDb.batchPutRecords[0] as any).data.fields).toEqual([]);
    });

    it("should be idempotent (running twice produces same result)", async () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const executor = container.resolve(DdbCommandExecutor);
        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        v5ToV6Preset.configure(runner);

        const model = modelRecord([
            {
                fieldId: "title",
                id: "field1",
                type: "text",
                storageId: "text@field1",
                helpText: "Enter your title",
                placeholderText: "e.g. My Article"
            }
        ]);

        // First run
        await executor.execute(await runner.processRecord(model));
        const firstResult = targetDb.batchPutRecords[0];

        // Reset
        targetDb.batchPutRecords.length = 0;

        // Second run
        const alreadyMigrated = JSON.parse(JSON.stringify(firstResult));
        await executor.execute(await runner.processRecord(alreadyMigrated));
        const secondResult = targetDb.batchPutRecords[0] as any;

        expect(secondResult.data.fields[0].note).toBe("Enter your title");
        expect(secondResult.data.fields[0].placeholder).toBe("e.g. My Article");
        expect(secondResult.data.fields[0].helpText).toBeUndefined();
        expect(secondResult.data.fields[0].placeholderText).toBeUndefined();
    });
});
