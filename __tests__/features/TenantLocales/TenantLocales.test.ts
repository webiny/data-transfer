import { describe, it, expect, beforeEach } from "vitest";
import { TenantLocales } from "../../../src/features/TenantLocales/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

describe("TenantLocales", () => {
    describe("preload", () => {
        it("should load tenants and their default locales", async () => {
            const container = createDdbContainer({
                sourceRecords: {
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
                }
            });

            const tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();

            expect(tenantLocales.getMap().get("root")).toBe("en-US");
        });

        it("should always include root tenant", async () => {
            const container = createDdbContainer();
            const tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();

            const map = tenantLocales.getMap();
            expect(map.has("root")).toBe(true);
            expect(map.get("root")).toBe("en-US");
        });

        it("should handle multiple tenants", async () => {
            const container = createDdbContainer({
                sourceRecords: {
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
                }
            });

            const tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();

            const map = tenantLocales.getMap();
            expect(map.size).toBe(2);
            expect(map.get("root")).toBe("en-US");
            expect(map.get("acme")).toBe("de-DE");
        });

        it("should default to en-US when locale record not found", async () => {
            const container = createDdbContainer({
                sourceRecords: {
                    "source-table": [
                        {
                            PK: "TENANTS",
                            SK: "root",
                            GSI1_PK: "TENANTS",
                            GSI1_SK: "root",
                            data: { id: "root" }
                        }
                    ]
                }
            });

            const tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();

            expect(tenantLocales.getMap().get("root")).toBe("en-US");
        });
    });

    describe("isDefaultLocaleRecord", () => {
        let tenantLocales: TenantLocales.Interface;

        beforeEach(async () => {
            const container = createDdbContainer();
            tenantLocales = container.resolve(TenantLocales);
            await tenantLocales.preload();
        });

        it("should accept records matching default locale", () => {
            expect(
                tenantLocales.isDefaultLocaleRecord({
                    PK: "T#root#L#en-US#CMS#CME#abc",
                    SK: "L"
                })
            ).toBe(true);
        });

        it("should reject records with non-default locale", () => {
            expect(
                tenantLocales.isDefaultLocaleRecord({
                    PK: "T#root#L#de-DE#CMS#CME#abc",
                    SK: "L"
                })
            ).toBe(false);
        });

        it("should accept records without locale in PK", () => {
            expect(
                tenantLocales.isDefaultLocaleRecord({ PK: "T#root#SETTINGS", SK: "general" })
            ).toBe(true);
        });

        it("should accept records without tenant prefix", () => {
            expect(tenantLocales.isDefaultLocaleRecord({ PK: "TENANTS", SK: "root" })).toBe(true);
        });

        it("should reject records from unknown tenant", () => {
            expect(
                tenantLocales.isDefaultLocaleRecord({
                    PK: "T#unknown#L#en-US#CMS#CME#abc",
                    SK: "L"
                })
            ).toBe(false);
        });
    });

    describe("DI registration", () => {
        it("should resolve from container", () => {
            const container = createDdbContainer();
            const resolved = container.resolve(TenantLocales);
            expect(resolved).toBeDefined();
            expect(typeof resolved.preload).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(TenantLocales)).toBe(container.resolve(TenantLocales));
        });
    });
});
