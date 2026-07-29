import { SourceDynamoDbClient } from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { TenantLocales as TenantLocalesAbstraction } from "./abstractions/TenantLocales.js";
class TenantLocalesImpl {
  database;
  logger;
  tenantLocales = new Map();
  tableName;
  constructor(database, logger, config) {
    this.database = database;
    this.logger = logger;
    this.tableName = config.source.dynamodb.tableName;
  }
  async preload() {
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
  getMap() {
    return this.tenantLocales;
  }
  isDefaultLocaleRecord(record) {
    const pk = record.PK;
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
  async fetchTenants() {
    try {
      const records = await this.database.query(this.tableName, "TENANTS", undefined, {
        indexName: "GSI1",
        pkAttribute: "GSI1_PK"
      });
      return records
        .filter(record => record.data && typeof record.data === "object")
        .map(record => {
          const data = record.data;
          return { id: data.id };
        });
    } catch (error) {
      this.logger.warn(`Failed to fetch tenants: ${error}`);
      return [];
    }
  }
  async fetchDefaultLocale(tenantId) {
    try {
      const pk = `T#${tenantId}#I18N#L`;
      const records = await this.database.query(this.tableName, pk, "D");
      if (records.length > 0 && records[0].data) {
        const data = records[0].data;
        return data.code || "en-US";
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
//# sourceMappingURL=TenantLocales.js.map
