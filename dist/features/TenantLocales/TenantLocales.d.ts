import { SourceDynamoDbClient } from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { TenantLocales as TenantLocalesAbstraction } from "./abstractions/TenantLocales.ts";
export type { ITenantLocales } from "./abstractions/TenantLocales.js";
declare class TenantLocalesImpl implements TenantLocalesAbstraction.Interface {
  private readonly database;
  private readonly logger;
  private tenantLocales;
  private readonly tableName;
  constructor(
    database: SourceDynamoDbClient.Interface,
    logger: Logger.Interface,
    config: MigrationConfig.Interface
  );
  preload(): Promise<void>;
  getMap(): Map<string, string>;
  isDefaultLocaleRecord(record: Record<string, unknown>): boolean;
  private fetchTenants;
  private fetchDefaultLocale;
}
export declare const TenantLocales: typeof TenantLocalesImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/TenantLocales.ts").ITenantLocales
  >;
};
//# sourceMappingURL=TenantLocales.d.ts.map
