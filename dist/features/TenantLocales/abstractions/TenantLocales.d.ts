export interface ITenantLocales {
  /** Fetch all tenants with their default locales from the source DB */
  preload(): Promise<void>;
  /** Get the map of tenantId -> defaultLocale */
  getMap(): Map<string, string>;
  /** Check if a record belongs to a default locale */
  isDefaultLocaleRecord(record: Record<string, unknown>): boolean;
}
export declare const TenantLocales: import("@webiny/di").Abstraction<ITenantLocales>;
export declare namespace TenantLocales {
  type Interface = ITenantLocales;
}
//# sourceMappingURL=TenantLocales.d.ts.map
