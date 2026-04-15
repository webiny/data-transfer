import "reflect-metadata";
import { Container } from "@webiny/di";
import { MigrationConfig } from "./features/MigrationConfig/index.ts";
import { MigrationConfigFeature } from "./features/MigrationConfig/index.ts";
import { DynamoDbClientConfig, DynamoDbClientFeature } from "./features/DynamoDbClient/index.ts";
import { LoggerFeature } from "./features/Logger/index.ts";
import { CacheFeature } from "./features/Cache/index.ts";
import { GzipCompressionFeature } from "./features/GzipCompression/index.ts";
import { ModelProviderFeature } from "./features/ModelProvider/index.ts";
import { TenantLocalesFeature } from "./features/TenantLocales/index.ts";
import {
  OpenSearchClientConfig,
  OpenSearchClientFeature
} from "./features/OpenSearchClient/index.ts";

export interface BootstrapOptions {
  config: MigrationConfig.Interface;
  logLevel?: "debug" | "info" | "warn" | "error";
  json?: boolean;
}

export function bootstrap(options: BootstrapOptions): Container {
  const { config } = options;
  const container = new Container();

  // Core: config + logger + cache + gzip
  MigrationConfigFeature.register(container, { config });
  LoggerFeature.register(container, {
    logLevel: options.logLevel || "info",
    json: options.json || false
  });
  CacheFeature.register(container);
  GzipCompressionFeature.register(container);

  // DynamoDB clients
  container.registerInstance(DynamoDbClientConfig, {
    source: {
      region: config.source.region,
      credentials: config.source.credentials
    },
    target: {
      region: config.target.region,
      credentials: config.target.credentials
    }
  });
  DynamoDbClientFeature.register(container);

  // OpenSearch client (os mode only)
  if (config.storage === "os" && config.target.credentials) {
    container.registerInstance(OpenSearchClientConfig, {
      endpoint: config.target.opensearch.endpoint,
      region: config.target.region,
      service: config.target.opensearch.service,
      credentials: config.target.credentials
    });
    OpenSearchClientFeature.register(container);
  }

  // Model provider + tenant locales
  ModelProviderFeature.register(container);
  TenantLocalesFeature.register(container);

  return container;
}
