import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { Container } from "@webiny/di";
import { TenantLocales, TenantLocalesFeature } from "../../../src/features/TenantLocales/index.ts";
import { SourceDynamoDbClient } from "../../../src/features/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MigrationConfig } from "../../../src/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { LoggerFeature } from "../../../src/features/Logger/index.ts";
import { MockDynamoDbClient } from "../DynamoDbClient/MockDynamoDbClient.ts";

function createContainer(database: MockDynamoDbClient): Container {
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
        pipeline: { preset: "v5-to-v6" }
    } as MigrationConfig.Interface);
    TenantLocalesFeature.register(container);
    return container;
}

describe("TenantLocales", () => {
    describe("preload", () => {
        it("should load tenants and their default locales", async () => {
            const database = new MockDynamoDbClient({
                "source-table": [
                    {
                        PK: "TENANTS",
                        SK: "root",
                        GSI1_PK: "TENANTS",
                        GSI1_SK: "root",
                        data: { id: "root" }
                    },
                    {
                        PK: "T#root#I18N#L",
                        SK: "D",
                        data: { code: "en-US" }
                    }
                ]
            });

            const container = createContainer(database);
            const tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();

            const map = tenantLocales.getMap();
            expect(map.get("root")).toBe("en-US");
        });

        it("should always include root tenant", async () => {
            const database = new MockDynamoDbClient();
            const container = createContainer(database);
            const tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();

            const map = tenantLocales.getMap();
            expect(map.has("root")).toBe(true);
            expect(map.get("root")).toBe("en-US");
        });

        it("should handle multiple tenants", async () => {
            const database = new MockDynamoDbClient({
                "source-table": [
                    {
                        PK: "TENANTS",
                        SK: "root",
                        GSI1_PK: "TENANTS",
                        GSI1_SK: "root",
                        data: { id: "root" }
                    },
                    {
                        PK: "TENANTS",
                        SK: "acme",
                        GSI1_PK: "TENANTS",
                        GSI1_SK: "acme",
                        data: { id: "acme" }
                    },
                    {
                        PK: "T#root#I18N#L",
                        SK: "D",
                        data: { code: "en-US" }
                    },
                    {
                        PK: "T#acme#I18N#L",
                        SK: "D",
                        data: { code: "de-DE" }
                    }
                ]
            });

            const container = createContainer(database);
            const tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();

            const map = tenantLocales.getMap();
            expect(map.size).toBe(2);
            expect(map.get("root")).toBe("en-US");
            expect(map.get("acme")).toBe("de-DE");
        });

        it("should default to en-US when locale record not found", async () => {
            const database = new MockDynamoDbClient({
                "source-table": [
                    {
                        PK: "TENANTS",
                        SK: "root",
                        GSI1_PK: "TENANTS",
                        GSI1_SK: "root",
                        data: { id: "root" }
                    }
                ]
            });

            const container = createContainer(database);
            const tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();

            expect(tenantLocales.getMap().get("root")).toBe("en-US");
        });
    });

    describe("isDefaultLocaleRecord", () => {
        let tenantLocales: TenantLocales.Interface;

        beforeEach(async () => {
            const database = new MockDynamoDbClient();
            const container = createContainer(database);
            tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();
        });

        it("should accept records matching default locale", () => {
            const record = { PK: "T#root#L#en-US#CMS#CME#abc", SK: "L" };
            expect(tenantLocales.isDefaultLocaleRecord(record)).toBe(true);
        });

        it("should reject records with non-default locale", () => {
            const record = { PK: "T#root#L#de-DE#CMS#CME#abc", SK: "L" };
            expect(tenantLocales.isDefaultLocaleRecord(record)).toBe(false);
        });

        it("should accept records without locale in PK", () => {
            const record = { PK: "T#root#SETTINGS", SK: "general" };
            expect(tenantLocales.isDefaultLocaleRecord(record)).toBe(true);
        });

        it("should accept records without tenant prefix", () => {
            const record = { PK: "TENANTS", SK: "root" };
            expect(tenantLocales.isDefaultLocaleRecord(record)).toBe(true);
        });

        it("should reject records from unknown tenant", () => {
            const record = { PK: "T#unknown#L#en-US#CMS#CME#abc", SK: "L" };
            expect(tenantLocales.isDefaultLocaleRecord(record)).toBe(false);
        });
    });

    describe("DI registration", () => {
        it("should resolve from container", () => {
            const database = new MockDynamoDbClient();
            const container = createContainer(database);
            const resolved = container.resolve(TenantLocales);
            expect(resolved).toBeDefined();
            expect(typeof resolved.preload).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const database = new MockDynamoDbClient();
            const container = createContainer(database);
            const first = container.resolve(TenantLocales);
            const second = container.resolve(TenantLocales);
            expect(first).toBe(second);
        });
    });
});
