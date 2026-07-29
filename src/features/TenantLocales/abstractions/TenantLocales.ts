import { createAbstraction } from "~/base/index.js";

interface ITenantLocales {
    /** Fetch all tenants with their default locales from the source DB */
    preload(): Promise<void>;
    /** Get the map of tenantId -> defaultLocale */
    getMap(): Map<string, string>;
    /** Check if a record belongs to a default locale */
    isDefaultLocaleRecord(record: Record<string, unknown>): boolean;
}

// ============================================================================
// Abstraction
// ============================================================================

export const TenantLocales = createAbstraction<ITenantLocales>("Core/TenantLocales");

export namespace TenantLocales {
    export type Interface = ITenantLocales;
}
