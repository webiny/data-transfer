import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { bootstrap } from "../src/bootstrap.ts";
import { MigrationConfig } from "../src/features/MigrationConfig/index.ts";
import {
  SourceDynamoDbClient,
  TargetDynamoDbClient
} from "../src/features/DynamoDbClient/index.ts";
import { Logger } from "../src/features/Logger/index.ts";
import { Cache } from "../src/features/Cache/index.ts";
import { GzipCompression } from "../src/features/GzipCompression/index.ts";
import { ModelProvider } from "../src/features/ModelProvider/index.ts";
import { TenantLocales } from "../src/features/TenantLocales/index.ts";
import { OpenSearchClient } from "../src/features/OpenSearchClient/index.ts";

describe("bootstrap", () => {
  const ddbConfig: MigrationConfig.Interface = {
    storage: "ddb",
    source: {
      region: "us-east-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
      dynamodb: { tableName: "source-table" },
      s3: { bucket: "source-bucket" }
    },
    target: {
      region: "eu-central-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
      dynamodb: { tableName: "target-table" },
      s3: { bucket: "target-bucket" }
    },
    migration: { preset: "v5-to-v6" }
  };

  const osConfig: MigrationConfig.Interface = {
    storage: "os",
    source: {
      region: "us-east-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
      dynamodb: { tableName: "source-primary" },
      opensearch: { tableName: "source-os" }
    },
    target: {
      region: "eu-central-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
      opensearch: {
        endpoint: "https://es.example.com",
        tableName: "target-os",
        service: "opensearch" as const
      }
    },
    migration: { preset: "v5-to-v6-os" }
  };

  describe("ddb mode", () => {
    it("should resolve all core features", () => {
      const container = bootstrap({ config: ddbConfig });

      expect(container.resolve(MigrationConfig)).toBeDefined();
      expect(container.resolve(Logger)).toBeDefined();
      expect(container.resolve(Cache)).toBeDefined();
      expect(container.resolve(GzipCompression)).toBeDefined();
      expect(container.resolve(SourceDynamoDbClient)).toBeDefined();
      expect(container.resolve(TargetDynamoDbClient)).toBeDefined();
      expect(container.resolve(ModelProvider)).toBeDefined();
      expect(container.resolve(TenantLocales)).toBeDefined();
    });

    it("should not register OpenSearchClient in ddb mode", () => {
      const container = bootstrap({ config: ddbConfig });

      expect(() => container.resolve(OpenSearchClient)).toThrow();
    });

    it("should use provided log level", () => {
      const container = bootstrap({ config: ddbConfig, logLevel: "debug" });
      const logger = container.resolve(Logger);
      expect(logger).toBeDefined();
    });
  });

  describe("os mode", () => {
    it("should resolve all core features including OpenSearchClient", () => {
      const container = bootstrap({ config: osConfig });

      expect(container.resolve(MigrationConfig)).toBeDefined();
      expect(container.resolve(Logger)).toBeDefined();
      expect(container.resolve(Cache)).toBeDefined();
      expect(container.resolve(GzipCompression)).toBeDefined();
      expect(container.resolve(SourceDynamoDbClient)).toBeDefined();
      expect(container.resolve(TargetDynamoDbClient)).toBeDefined();
      expect(container.resolve(ModelProvider)).toBeDefined();
      expect(container.resolve(TenantLocales)).toBeDefined();
      expect(container.resolve(OpenSearchClient)).toBeDefined();
    });

    it("should skip OpenSearchClient when credentials missing", () => {
      const configWithoutCreds = {
        ...osConfig,
        target: {
          ...osConfig.target,
          credentials: undefined
        }
      } as MigrationConfig.Interface;

      const container = bootstrap({ config: configWithoutCreds });

      expect(() => container.resolve(OpenSearchClient)).toThrow();
    });
  });

  describe("singleton behavior", () => {
    it("should return same instances on multiple resolves", () => {
      const container = bootstrap({ config: ddbConfig });

      expect(container.resolve(Logger)).toBe(container.resolve(Logger));
      expect(container.resolve(Cache)).toBe(container.resolve(Cache));
      expect(container.resolve(SourceDynamoDbClient)).toBe(container.resolve(SourceDynamoDbClient));
      expect(container.resolve(TargetDynamoDbClient)).toBe(container.resolve(TargetDynamoDbClient));
    });
  });
});
