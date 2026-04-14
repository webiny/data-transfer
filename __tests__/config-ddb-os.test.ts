import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config/loader.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("config validation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "migration-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(config: object): string {
    const filePath = join(tmpDir, "config.ts");
    writeFileSync(filePath, `export default ${JSON.stringify(config, null, 2)};`);
    return filePath;
  }

  it("should accept valid ddb config", async () => {
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

  it("should accept valid ddb-os config with basic auth", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          endpoint: "https://es.example.com",
          targetTableName: "tgt-es",
          sourceTableName: "src-es",
          auth: { type: "basic", username: "admin", password: "admin" }
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    const config = await loadConfig(configPath);
    expect(config.storage).toBe("ddb-os");
  });

  it("should accept valid ddb-os config with AWS auth", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          endpoint: "https://search-xxx.eu-central-1.es.amazonaws.com",
          targetTableName: "tgt-es",
          sourceTableName: "src-es",
          auth: {
            type: "aws",
            region: "eu-central-1",
            service: "opensearch",
            accessKeyId: "AKIA...",
            secretAccessKey: "secret"
          }
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    const config = await loadConfig(configPath);
    expect(config.storage).toBe("ddb-os");
  });

  it("should reject missing storage field", async () => {
    const configPath = writeConfig({
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

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject invalid storage type", async () => {
    const configPath = writeConfig({
      storage: "invalid",
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

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject ddb-os without target.opensearch", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
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

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject ddb-os with missing opensearch.endpoint", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          targetTableName: "tgt-es",
          sourceTableName: "src-es",
          auth: { type: "basic", username: "admin", password: "admin" }
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject ddb-os with missing opensearch.auth", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          endpoint: "https://es.example.com",
          tableName: "tgt-es"
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
  });
});
