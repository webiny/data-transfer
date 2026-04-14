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

  // ---- DDB config ----

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

  // ---- OS config ----

  it("should accept valid os config", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: {
        region: "eu-central-1",
        credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
        dynamodb: { tableName: "src-primary" },
        opensearch: { tableName: "src-es" }
      },
      target: {
        region: "eu-central-1",
        credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
        opensearch: {
          endpoint: "https://search-xxx.eu-central-1.es.amazonaws.com",
          tableName: "tgt-es",
          service: "opensearch"
        }
      },
      migration: { preset: "v5-to-v6-os" }
    });

    const config = await loadConfig(configPath);
    expect(config.storage).toBe("os");
  });

  it("should accept os config with opensearch-serverless", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src-primary" },
        opensearch: { tableName: "src-es" }
      },
      target: {
        region: "eu-central-1",
        opensearch: {
          endpoint: "https://xxx.eu-central-1.aoss.amazonaws.com",
          tableName: "tgt-es",
          service: "opensearch-serverless"
        }
      },
      migration: { preset: "v5-to-v6-os" }
    });

    const config = await loadConfig(configPath);
    if (config.storage === "os") {
      expect(config.target.opensearch.service).toBe("opensearch-serverless");
    }
  });

  // ---- Rejection tests ----

  it("should reject missing storage field", async () => {
    const configPath = writeConfig({
      source: { region: "eu-central-1", dynamodb: { tableName: "s" }, s3: { bucket: "b" } },
      target: { region: "eu-central-1", dynamodb: { tableName: "t" }, s3: { bucket: "b" } },
      migration: { preset: "v5-to-v6" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject invalid storage type", async () => {
    const configPath = writeConfig({
      storage: "invalid",
      source: { region: "eu-central-1", dynamodb: { tableName: "s" }, s3: { bucket: "b" } },
      target: { region: "eu-central-1", dynamodb: { tableName: "t" }, s3: { bucket: "b" } },
      migration: { preset: "v5-to-v6" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject os config without source.opensearch", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: { region: "eu-central-1", dynamodb: { tableName: "src" } },
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
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject os config without source.dynamodb", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: { region: "eu-central-1", opensearch: { tableName: "src-es" } },
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
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject os config without target.opensearch", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        opensearch: { tableName: "src-es" }
      },
      target: { region: "eu-central-1" },
      migration: { preset: "v5-to-v6-os" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject os config without target.opensearch.service", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        opensearch: { tableName: "src-es" }
      },
      target: {
        region: "eu-central-1",
        opensearch: { endpoint: "https://es.example.com", tableName: "tgt-es" }
      },
      migration: { preset: "v5-to-v6-os" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject os config without target.opensearch.endpoint", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        opensearch: { tableName: "src-es" }
      },
      target: {
        region: "eu-central-1",
        opensearch: { tableName: "tgt-es", service: "opensearch" }
      },
      migration: { preset: "v5-to-v6-os" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });
});
