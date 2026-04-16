import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { Container } from "@webiny/di";
import { TenantLocalesImpl } from "../../../src/features/TenantLocales/TenantLocales.ts";
import { TenantLocales } from "../../../src/features/TenantLocales/abstractions/TenantLocales.ts";
import { MockDynamoDbClient } from "../DynamoDbClient/MockDynamoDbClient.ts";

const mockLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    done: () => {}
};

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

            const tenantLocales = new TenantLocalesImpl(database, mockLogger, "source-table");
            await tenantLocales.preload();

            const map = tenantLocales.getMap();
            expect(map.get("root")).toBe("en-US");
        });

        it("should always include root tenant", async () => {
            const database = new MockDynamoDbClient();

            const tenantLocales = new TenantLocalesImpl(database, mockLogger, "source-table");
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

            const tenantLocales = new TenantLocalesImpl(database, mockLogger, "source-table");
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

            const tenantLocales = new TenantLocalesImpl(database, mockLogger, "source-table");
            await tenantLocales.preload();

            expect(tenantLocales.getMap().get("root")).toBe("en-US");
        });
    });

    describe("isDefaultLocaleRecord", () => {
        let tenantLocales: TenantLocalesImpl;

        beforeEach(async () => {
            const database = new MockDynamoDbClient();
            tenantLocales = new TenantLocalesImpl(database, mockLogger, "source-table");
            // Manually set locales for testing
            await tenantLocales.preload();
            // root -> en-US is auto-added
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
            const container = new Container();
            const database = new MockDynamoDbClient();
            const instance = new TenantLocalesImpl(database, mockLogger, "source-table");

            container.registerInstance(TenantLocales, instance);

            const resolved = container.resolve(TenantLocales);
            expect(resolved).toBe(instance);
        });
    });
});
