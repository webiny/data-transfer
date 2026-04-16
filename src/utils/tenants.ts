import { DatabaseClient } from "../database/interface.ts";

// ============================================================================
// Tenant and Locale Utilities
// ============================================================================

export interface TenantInfo {
    id: string;
    defaultLocale: string;
}

/**
 * Fetches all tenants from the database
 */
export async function fetchTenants(
    database: DatabaseClient,
    tableName: string
): Promise<TenantInfo[]> {
    // Query for all tenant records using GSI1
    const records = await database.query(tableName, "TENANTS", undefined, {
        indexName: "GSI1"
    });

    return records
        .filter(record => record.data && typeof record.data === "object")
        .map(record => {
            const data = record.data as Record<string, unknown>;
            return {
                id: data.id as string,
                defaultLocale: "en-US" // Default fallback
            };
        });
}

/**
 * Fetches the default locale for a specific tenant
 */
export async function fetchDefaultLocale(
    database: DatabaseClient,
    tableName: string,
    tenantId: string
): Promise<string> {
    // Query for default locale record: T#{tenantId}#I18N#L#D
    const pk = `T#${tenantId}#I18N#L`;
    const records = await database.query(tableName, pk, "D");

    if (records.length > 0 && records[0].data) {
        const data = records[0].data as Record<string, unknown>;
        return (data.code as string) || "en-US";
    }

    return "en-US"; // Default fallback
}

/**
 * Fetches all tenants with their default locales
 */
export async function fetchTenantsWithLocales(
    database: DatabaseClient,
    tableName: string
): Promise<Map<string, string>> {
    const tenants = await fetchTenants(database, tableName);
    const tenantLocales = new Map<string, string>();

    for (const tenant of tenants) {
        const locale = await fetchDefaultLocale(database, tableName, tenant.id);
        tenantLocales.set(tenant.id, locale);
    }

    // Always add root tenant if not present
    if (!tenantLocales.has("root")) {
        tenantLocales.set("root", "en-US");
    }

    return tenantLocales;
}

/**
 * Checks if a record belongs to a default locale
 */
export function isDefaultLocaleRecord(
    record: Record<string, unknown>,
    tenantLocales: Map<string, string>
): boolean {
    // Extract tenant from PK (e.g., T#root#... -> root)
    const pk = record.PK as string;
    if (!pk || !pk.startsWith("T#")) {
        // If no tenant in PK, allow the record
        return true;
    }

    const parts = pk.split("#");
    if (parts.length < 2) {
        return true;
    }

    // Check if PK contains a locale marker
    const localeMatch = pk.match(/#L#([^#]+)/);
    if (!localeMatch) {
        // No locale in PK, allow the record
        return true;
    }

    const tenantId = parts[1];
    const defaultLocale = tenantLocales.get(tenantId);

    if (!defaultLocale) {
        // Unknown tenant, skip
        return false;
    }

    const recordLocale = localeMatch[1];
    return recordLocale === defaultLocale;
}
