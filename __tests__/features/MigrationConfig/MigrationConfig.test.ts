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

describe("loadConfig", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "mc-test-"));
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    const creds = { accessKeyId: "AKIA", secretAccessKey: "secret" };

    function writeConfig(config: object): string {
        const p = join(tmpDir, "config.ts");
        writeFileSync(p, `export default ${JSON.stringify(config, null, 2)};`);
        return p;
    }

    it("loads a valid unified config", async () => {
        const p = writeConfig({
            source: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "src" },
                s3: { bucket: "src-b" }
            },
            target: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "tgt" },
                s3: { bucket: "tgt-b" }
            },
            pipeline: {}
        });
        const config = await loadConfig(p);
        expect(config.source.dynamodb.tableName).toBe("src");
        expect((config as any).storage).toBeUndefined();
    });

    it("loads a config with opensearch fields", async () => {
        const p = writeConfig({
            source: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "src" },
                s3: { bucket: "src-b" },
                opensearch: { tableName: "src-os" }
            },
            target: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "tgt" },
                s3: { bucket: "tgt-b" },
                opensearch: {
                    endpoint: "https://es.example.com",
                    tableName: "tgt-os",
                    service: "opensearch",
                    indexPrefix: ""
                }
            },
            pipeline: {}
        });
        const config = await loadConfig(p);
        expect(config.source.opensearch?.tableName).toBe("src-os");
    });

    it("rejects invalid config", async () => {
        const p = writeConfig({ invalid: true });
        await expect(loadConfig(p)).rejects.toThrow();
    });

    it("rejects config missing required fields", async () => {
        const p = writeConfig({ source: { region: "us-east-1" } });
        await expect(loadConfig(p)).rejects.toThrow();
    });

    it("rejects file with no default export", async () => {
        const p = join(tmpDir, "config.ts");
        writeFileSync(p, "export const x = 1;");
        await expect(loadConfig(p)).rejects.toThrow(/default export/);
    });

    it("resolves presetsDir relative to config file directory", async () => {
        const p = writeConfig({
            source: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "src" },
                s3: { bucket: "src-b" }
            },
            target: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "tgt" },
                s3: { bucket: "tgt-b" }
            },
            pipeline: { presetsDir: "./custom-presets" }
        });
        const config = await loadConfig(p);
        expect(config.pipeline?.presetsDir).toBe(join(tmpDir, "custom-presets"));
    });

    it("resolves modelsDir relative to config file directory", async () => {
        const p = writeConfig({
            source: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "src" },
                s3: { bucket: "src-b" }
            },
            target: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "tgt" },
                s3: { bucket: "tgt-b" }
            },
            pipeline: { modelsDir: "./models" }
        });
        const config = await loadConfig(p);
        expect(config.pipeline?.modelsDir).toBe(join(tmpDir, "models"));
    });
});

describe("MigrationConfig DI registration", () => {
    it("registers and resolves the config", async () => {
        const creds = { accessKeyId: "AKIA", secretAccessKey: "secret" };
        const { migrationConfigSchema } =
            await import("../../../src/features/MigrationConfig/validation.ts");
        const config = migrationConfigSchema.parse({
            source: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "src" },
                s3: { bucket: "src-b" }
            },
            target: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "tgt" },
                s3: { bucket: "tgt-b" }
            },
            pipeline: {}
        });
        const container = new Container();
        MigrationConfigFeature.register(container, { config });
        const resolved = container.resolve(MigrationConfig);
        expect(resolved.source.dynamodb.tableName).toBe("src");
        const second = container.resolve(MigrationConfig);
        expect(resolved).toBe(second);
    });
});
