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

  it("should accept valid ddb-os config", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        credentials: {
          accessKeyId: "AKIA...",
          secretAccessKey: "secret"
        },
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          endpoint: "https://search-xxx.eu-central-1.es.amazonaws.com",
          targetTableName: "tgt-es",
          sourceTableName: "src-es",
          service: "opensearch"
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    const config = await loadConfig(configPath);
    expect(config.storage).toBe("ddb-os");
  });

  it("should accept ddb-os config with opensearch-serverless service", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        credentials: {
          accessKeyId: "AKIA...",
          secretAccessKey: "secret"
        },
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          endpoint: "https://search-xxx.eu-central-1.aoss.amazonaws.com",
          targetTableName: "tgt-es",
          sourceTableName: "src-es",
          service: "opensearch-serverless"
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    const config = await loadConfig(configPath);
    expect(config.storage).toBe("ddb-os");
    if (config.storage === "ddb-os") {
      expect(config.target.opensearch.service).toBe("opensearch-serverless");
    }
  });

  it("should reject ddb-os with missing opensearch.service", async () => {
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
          sourceTableName: "src-es"
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
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
          sourceTableName: "src-es"
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject ddb-os with missing opensearch.targetTableName", async () => {
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
          sourceTableName: "src-es"
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
  });
});
