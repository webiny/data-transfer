import { describe, it, expect, beforeEach } from "vitest";
import { createTestRunner } from "../src/utils/test-helpers.ts";
import { executeCommands } from "../src/core/executor.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";
import { MockStorageClient } from "./mocks/storage-client.ts";
import { DatabaseRecord } from "./database/interface.ts";

describe("CMS Model Field Attributes", () => {
    let database: MockDatabaseClient;
    let storage: MockStorageClient;
    let config: MigrationConfig;
    let modelProvider: ModelProvider;

    beforeEach(() => {
        database = new MockDatabaseClient();
        storage = new MockStorageClient();
        modelProvider = new ModelProvider(database, "source-table");
        config = {
            sourcePrimaryTable: "source-table",
            targetPrimaryTable: "target-table",
            sourceFmBucket: "source-bucket",
            targetFmBucket: "target-bucket",
            modelProvider
        };
    });

    it("should rename helpText to description at field level", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: "Enter your title"
                }
            ]
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        const field = migratedRecord.data.fields[0];

        expect(field.note).toBe("Enter your title");
        expect(field.helpText).toBeUndefined();
    });

    it("should rename placeholderText to placeholder at field level", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    placeholderText: "e.g. My Article"
                }
            ]
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        const field = migratedRecord.data.fields[0];

        expect(field.placeholder).toBe("e.g. My Article");
        expect(field.placeholderText).toBeUndefined();
    });

    it("should rename both attributes simultaneously", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: "Enter your title",
                    placeholderText: "e.g. My Article"
                }
            ]
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        const field = migratedRecord.data.fields[0];

        expect(field.note).toBe("Enter your title");
        expect(field.placeholder).toBe("e.g. My Article");
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
    });

    it("should rename attributes in object nested fields", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
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
            ]
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        const objectField = migratedRecord.data.fields[0];
        const nestedField = objectField.settings.fields[0];

        expect(nestedField.note).toBe("Author name");
        expect(nestedField.placeholder).toBe("John Doe");
        expect(nestedField.helpText).toBeUndefined();
        expect(nestedField.placeholderText).toBeUndefined();
    });

    it("should rename attributes in dynamic zone template fields", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
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
            ]
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        const dzField = migratedRecord.data.fields[0];
        const templateField = dzField.settings.templates[0].fields[0];

        expect(templateField.note).toBe("Rich text content");
        expect(templateField.placeholder).toBe("Start typing...");
        expect(templateField.helpText).toBeUndefined();
        expect(templateField.placeholderText).toBeUndefined();
    });

    it("should handle deeply nested fields (object in dynamic zone)", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
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
            ]
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        const dzField = migratedRecord.data.fields[0];
        const templateObjectField = dzField.settings.templates[0].fields[0];
        const deeplyNestedField = templateObjectField.settings.fields[0];

        expect(deeplyNestedField.note).toBe("Card title text");
        expect(deeplyNestedField.placeholder).toBe("Enter title");
        expect(deeplyNestedField.helpText).toBeUndefined();
        expect(deeplyNestedField.placeholderText).toBeUndefined();
    });

    it("should preserve existing description/placeholder if already present", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: "Old help text",
                    placeholderText: "Old placeholder"
                }
            ]
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        const field = migratedRecord.data.fields[0];

        // Existing values should be preserved
        expect(field.note).toBe("Old help text");
        expect(field.placeholder).toBe("Old placeholder");
        // Old attributes should be deleted
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
    });

    it("should handle null values correctly", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: null,
                    placeholderText: null
                }
            ]
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        const field = migratedRecord.data.fields[0];

        // Null values should be renamed
        expect(field.note).toBeNull();
        expect(field.placeholder).toBeNull();
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
    });

    it("should handle fields without the attributes (no-op)", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    label: "Title"
                }
            ]
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        const field = migratedRecord.data.fields[0];

        // No attributes should be added
        expect(field.description).toBeUndefined();
        expect(field.placeholder).toBeUndefined();
        expect(field.helpText).toBeUndefined();
        expect(field.placeholderText).toBeUndefined();
        // Original attributes preserved
        expect(field.label).toBe("Title");
    });

    it("should handle empty fields array", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: []
        };

        const runner = createTestRunner(config, database);
        const commands = await runner.processRecord(model);
        await executeCommands(commands, { database, storage });

        const migratedRecord = database.batchPutRecords[0];
        expect(migratedRecord.data.fields).toEqual([]);
    });

    it("should be idempotent (running twice produces same result)", async () => {
        const model: DatabaseRecord = {
            PK: "T#root#L#en-US#CMS#CM",
            SK: "testModel",
            TYPE: "cms.model",
            modelId: "testModel",
            tenant: "root",
            locale: "en-US",
            fields: [
                {
                    fieldId: "title",
                    id: "field1",
                    type: "text",
                    storageId: "text@field1",
                    helpText: "Enter your title",
                    placeholderText: "e.g. My Article"
                }
            ]
        };

        const runner = createTestRunner(config, database);

        // First run
        const commands1 = await runner.processRecord(model);
        await executeCommands(commands1, { database, storage });
        const firstResult = database.batchPutRecords[0];

        // Reset database
        database.batchPutRecords = [];

        // Second run (should already be migrated)
        const alreadyMigrated = JSON.parse(JSON.stringify(firstResult));
        const commands2 = await runner.processRecord(alreadyMigrated);
        await executeCommands(commands2, { database, storage });
        const secondResult = database.batchPutRecords[0];

        // Results should be identical
        expect(secondResult.data.fields[0].note).toBe("Enter your title");
        expect(secondResult.data.fields[0].placeholder).toBe("e.g. My Article");
        expect(secondResult.data.fields[0].helpText).toBeUndefined();
        expect(secondResult.data.fields[0].placeholderText).toBeUndefined();
    });
});
