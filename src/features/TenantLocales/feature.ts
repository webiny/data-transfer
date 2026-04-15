import { createFeature } from "@/src/base/index.ts";
import { TenantLocalesImpl } from "./TenantLocales.ts";
import { TenantLocales } from "./abstractions/TenantLocales.ts";
import { SourceDynamoDbClient } from "../DynamoDbClient/abstractions/DynamoDbClient.ts";
import { Logger } from "../Logger/abstractions/Logger.ts";
import { MigrationConfig } from "../MigrationConfig/abstractions/MigrationConfig.ts";

export const TenantLocalesFeature = createFeature({
  name: "Core/TenantLocalesFeature",
  register(container) {
    const database = container.resolve(SourceDynamoDbClient);
    const logger = container.resolve(Logger);
    const config = container.resolve(MigrationConfig);

    const tableName = config.source.dynamodb.tableName;

    const tenantLocales = new TenantLocalesImpl(database, logger, tableName);
    container.registerInstance(TenantLocales, tenantLocales);
  }
});
