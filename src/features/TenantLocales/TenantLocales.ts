import { SourceDynamoDbClient } from "../DynamoDbClient/abstractions/DynamoDbClient.ts";
import { Logger } from "../Logger/abstractions/Logger.ts";
import { MigrationConfig } from "../MigrationConfig/abstractions/MigrationConfig.ts";
import { TenantLocales as TenantLocalesAbstraction } from "./abstractions/TenantLocales.ts";

class TenantLocalesImpl implements TenantLocalesAbstraction.Interface {
    private tenantLocales: Map<string, string> = new Map();
    private readonly tableName: string;

    public constructor(
        private readonly database: SourceDynamoDbClient.Interface,
        private readonly logger: Logger.Interface,
        config: MigrationConfig.Interface
    ) {
        this.tableName = config.source.dynamodb.tableName;
    }

    public async preload(): Promise<void> {
        const tenants = await this.fetchTenants();
        this.tenantLocales = new Map();

        for (const tenant of tenants) {
            const locale = await this.fetchDefaultLocale(tenant.id);
            this.tenantLocales.set(tenant.id, locale);
        }

        // Always add root tenant if not present
        if (!this.tenantLocales.has("root")) {
            this.tenantLocales.set("root", "en-US");
        }

        this.logger.info(`Found ${this.tenantLocales.size} tenants`);
    }

    public getMap(): Map<string, string> {
        return this.tenantLocales;
    }

    public isDefaultLocaleRecord(record: Record<string, unknown>): boolean {
        const pk = record.PK as string;
        if (!pk || !pk.startsWith("T#")) {
            return true;
        }

        const parts = pk.split("#");
        if (parts.length < 2) {
            return true;
        }

        const localeMatch = pk.match(/#L#([^#]+)/);
        if (!localeMatch) {
            return true;
        }

        const tenantId = parts[1];
        const defaultLocale = this.tenantLocales.get(tenantId);

        if (!defaultLocale) {
            return false;
        }

        const recordLocale = localeMatch[1];
        return recordLocale === defaultLocale;
    }

    private async fetchTenants(): Promise<Array<{ id: string }>> {
        try {
            const records = await this.database.query(this.tableName, "TENANTS", undefined, {
                indexName: "GSI1"
            });

            return records
                .filter(record => record.data && typeof record.data === "object")
                .map(record => {
                    const data = record.data as Record<string, unknown>;
                    return { id: data.id as string };
                });
        } catch (error) {
            this.logger.warn(`Failed to fetch tenants: ${error}`);
            return [];
        }
    }

    private async fetchDefaultLocale(tenantId: string): Promise<string> {
        try {
            const pk = `T#${tenantId}#I18N#L`;
            const records = await this.database.query(this.tableName, pk, "D");

            if (records.length > 0 && records[0].data) {
                const data = records[0].data as Record<string, unknown>;
                return (data.code as string) || "en-US";
            }
        } catch (error) {
            this.logger.warn(`Failed to fetch locale for tenant ${tenantId}: ${error}`);
        }

        return "en-US";
    }
}

export const TenantLocales = TenantLocalesAbstraction.createImplementation({
    implementation: TenantLocalesImpl,
    dependencies: [SourceDynamoDbClient, Logger, MigrationConfig]
});
