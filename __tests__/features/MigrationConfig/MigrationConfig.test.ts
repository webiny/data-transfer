import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Container } from "@webiny/di";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MigrationConfig,
  MigrationConfigFeature,
  loadConfig
} from "../../../src/features/MigrationConfig/index.ts";

describe("MigrationConfig Feature", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "migration-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(config: object): string {
    const filePath = join(tmpDir, "config.ts");
    writeFileSync(filePath, `export default ${JSON.stringify(config, null, 2)};`);
    return filePath;
  }

  describe("loadConfig", () => {
    it("should load and validate a ddb config", async () => {
      const configPath = writeConfig({
        storage: "ddb",
        source: {
          region: "eu-central-1",
          dynamodb: { tableName: "src" },
          s3: { bucket: "src-bucket" }
        },
        target: {
          region: "eu-central-1",
          dynamodb: { tableName: "tgt" },
          s3: { bucket: "tgt-bucket" }
        },
        migration: { preset: "v5-to-v6" }
      });

      const config = await loadConfig(configPath);
      expect(config.storage).toBe("ddb");
    });

    it("should load and validate an os config", async () => {
      const configPath = writeConfig({
        storage: "os",
        source: {
          region: "eu-central-1",
          dynamodb: { tableName: "src" },
          opensearch: { tableName: "src-es" }
        },
        target: {
          region: "eu-central-1",
          opensearch: {
            endpoint: "https://es.example.com",
            tableName: "tgt-es",
            service: "opensearch"
          }
        },
        migration: { preset: "v5-to-v6-os" }
      });

      const config = await loadConfig(configPath);
      expect(config.storage).toBe("os");
    });

    it("should reject invalid config", async () => {
      const configPath = writeConfig({ invalid: true });
      await expect(loadConfig(configPath)).rejects.toThrow();
    });
  });

  describe("DI registration", () => {
    it("should register config and resolve it from container", async () => {
      const configPath = writeConfig({
        storage: "ddb",
        source: {
          region: "eu-central-1",
          dynamodb: { tableName: "src" },
          s3: { bucket: "src-bucket" }
        },
        target: {
          region: "eu-central-1",
          dynamodb: { tableName: "tgt" },
          s3: { bucket: "tgt-bucket" }
        },
        migration: { preset: "v5-to-v6" }
      });

      const config = await loadConfig(configPath);
      const container = new Container();

      MigrationConfigFeature.register(container, { config });

      const resolved = container.resolve(MigrationConfig);
      expect(resolved.storage).toBe("ddb");
    });

    it("should resolve same instance on multiple resolves", async () => {
      const configPath = writeConfig({
        storage: "ddb",
        source: {
          region: "eu-central-1",
          dynamodb: { tableName: "src" },
          s3: { bucket: "src-bucket" }
        },
        target: {
          region: "eu-central-1",
          dynamodb: { tableName: "tgt" },
          s3: { bucket: "tgt-bucket" }
        },
        migration: { preset: "v5-to-v6" }
      });

      const config = await loadConfig(configPath);
      const container = new Container();

      MigrationConfigFeature.register(container, { config });

      const first = container.resolve(MigrationConfig);
      const second = container.resolve(MigrationConfig);
      expect(first).toBe(second);
    });
  });
});
