import { describe, it, expect } from "vitest";
import { createConfig } from "../../../src/features/MigrationConfig/createConfig.ts";

const creds = { accessKeyId: "AKIA", secretAccessKey: "secret" };

const baseSource = {
    region: "us-east-1",
    credentials: creds,
    dynamodb: { tableName: "src-table" },
    s3: { bucket: "src-bucket" }
};

const baseTarget = {
    region: "eu-central-1",
    credentials: creds,
    dynamodb: { tableName: "tgt-table" },
    s3: { bucket: "tgt-bucket" }
};

describe("createConfig — happy path", () => {
    it("returns a config with required fields, no storage field", () => {
        const config = createConfig({ source: baseSource, target: baseTarget, pipeline: {} });
        expect(config.source.dynamodb.tableName).toBe("src-table");
        expect(config.target.s3.bucket).toBe("tgt-bucket");
        expect((config as any).storage).toBeUndefined();
        expect((config as any).pipeline?.preset).toBeUndefined();
    });

    it("accepts optional opensearch on both sides", () => {
        const config = createConfig({
            source: { ...baseSource, opensearch: { tableName: "src-os" } },
            target: {
                ...baseTarget,
                opensearch: {
                    endpoint: "https://search-x.es.amazonaws.com",
                    tableName: "tgt-os",
                    service: "opensearch",
                    indexPrefix: ""
                }
            },
            pipeline: {}
        });
        expect(config.source.opensearch?.tableName).toBe("src-os");
        expect(config.target.opensearch?.endpoint).toBe("https://search-x.es.amazonaws.com");
    });

    it("accepts opensearch-serverless service", () => {
        const config = createConfig({
            source: { ...baseSource, opensearch: { tableName: "src-os" } },
            target: {
                ...baseTarget,
                opensearch: {
                    endpoint: "https://xxx.aoss.amazonaws.com",
                    tableName: "tgt-os",
                    service: "opensearch-serverless",
                    indexPrefix: ""
                }
            },
            pipeline: {}
        });
        expect(config.target.opensearch?.service).toBe("opensearch-serverless");
    });

    it("accepts optional auditLog", () => {
        const config = createConfig({
            source: baseSource,
            target: { ...baseTarget, auditLog: { dynamodb: { tableName: "audit-table" } } },
            pipeline: {}
        });
        expect(config.target.auditLog?.dynamodb?.tableName).toBe("audit-table");
    });

    it("accepts nullable auditLog (null = skip)", () => {
        const config = createConfig({
            source: baseSource,
            target: { ...baseTarget, auditLog: null },
            pipeline: {}
        });
        expect(config.target.auditLog).toBeNull();
    });

    it("trims whitespace from string fields", () => {
        const config = createConfig({
            source: { ...baseSource, region: "  us-east-1  ", dynamodb: { tableName: "  src  " }, s3: { bucket: "  src-b  " } },
            target: { ...baseTarget, region: " eu-central-1 " },
            pipeline: {}
        });
        expect(config.source.region).toBe("us-east-1");
        expect(config.source.dynamodb.tableName).toBe("src");
        expect(config.source.s3.bucket).toBe("src-b");
        expect(config.target.region).toBe("eu-central-1");
    });

    it("accepts optional segments / modelsDir / presetsDir in pipeline", () => {
        const config = createConfig({
            source: baseSource,
            target: baseTarget,
            pipeline: { segments: 8, modelsDir: "./models", presetsDir: "./presets" }
        });
        expect(config.pipeline?.segments).toBe(8);
        expect(config.pipeline?.modelsDir).toBe("./models");
    });
});

describe("createConfig — validation errors", () => {
    it("throws on missing source region", () => {
        expect(() =>
            createConfig({ source: { ...baseSource, region: "" } as any, target: baseTarget, pipeline: {} })
        ).toThrow();
    });

    it("throws on whitespace-only table name", () => {
        expect(() =>
            createConfig({
                source: { ...baseSource, dynamodb: { tableName: "   " } },
                target: baseTarget,
                pipeline: {}
            })
        ).toThrow();
    });

    it("throws on missing credentials", () => {
        expect(() =>
            createConfig({ source: { ...baseSource, credentials: undefined as any }, target: baseTarget, pipeline: {} })
        ).toThrow();
    });

    it("throws when only source.opensearch is set (target must match)", () => {
        expect(() =>
            createConfig({
                source: { ...baseSource, opensearch: { tableName: "src-os" } },
                target: baseTarget,
                pipeline: {}
            })
        ).toThrow(/both be set or both be absent/);
    });

    it("throws when only target.opensearch is set", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: {
                    ...baseTarget,
                    opensearch: {
                        endpoint: "https://es.example.com",
                        tableName: "tgt-os",
                        service: "opensearch",
                        indexPrefix: ""
                    }
                },
                pipeline: {}
            })
        ).toThrow(/both be set or both be absent/);
    });

    it("throws on same S3 bucket for source and target", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: { ...baseTarget, s3: { bucket: baseSource.s3.bucket } },
                pipeline: {}
            })
        ).toThrow(/same as source/);
    });

    it("throws on same region + same DDB table", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: { ...baseTarget, region: baseSource.region, dynamodb: { tableName: baseSource.dynamodb.tableName } },
                pipeline: {}
            })
        ).toThrow(/matches source/);
    });

    it("accepts same DDB table across different regions", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: { ...baseTarget, dynamodb: { tableName: baseSource.dynamodb.tableName } },
                pipeline: {}
            })
        ).not.toThrow();
    });

    it("throws on same region + same OS table when opensearch present", () => {
        expect(() =>
            createConfig({
                source: { ...baseSource, opensearch: { tableName: "same-os" } },
                target: {
                    ...baseTarget,
                    region: baseSource.region,
                    opensearch: {
                        endpoint: "https://es.example.com",
                        tableName: "same-os",
                        service: "opensearch",
                        indexPrefix: ""
                    }
                },
                pipeline: {}
            })
        ).toThrow(/matches source/);
    });

    it("throws on auditLog table matching main target table", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: {
                    ...baseTarget,
                    auditLog: { dynamodb: { tableName: baseTarget.dynamodb.tableName } }
                },
                pipeline: {}
            })
        ).toThrow(/must differ/);
    });

    it("throws on invalid opensearch endpoint URL", () => {
        expect(() =>
            createConfig({
                source: { ...baseSource, opensearch: { tableName: "src-os" } },
                target: {
                    ...baseTarget,
                    opensearch: {
                        endpoint: "not-a-url",
                        tableName: "tgt-os",
                        service: "opensearch",
                        indexPrefix: ""
                    }
                },
                pipeline: {}
            })
        ).toThrow();
    });

    it("collision guard runs on trimmed values", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: {
                    ...baseTarget,
                    region: baseSource.region,
                    dynamodb: { tableName: "src-table " }
                },
                pipeline: {}
            })
        ).toThrow(/matches source/);
    });
});
