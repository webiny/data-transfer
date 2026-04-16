import { describe, it, expect } from "vitest";
import { createDdbTransfer } from "../../../src/features/MigrationConfig/createDdbTransfer.ts";
import { createOsTransfer } from "../../../src/features/MigrationConfig/createOsTransfer.ts";

const creds = { accessKeyId: "AKIA", secretAccessKey: "secret" };

describe("createDdbTransfer", () => {
    it("should return a valid ddb config with storage set", () => {
        const config = createDdbTransfer({
            source: {
                region: "us-east-1",
                credentials: creds,
                dynamodb: { tableName: "src" },
                s3: { bucket: "src-bucket" }
            },
            target: {
                region: "eu-central-1",
                credentials: creds,
                dynamodb: { tableName: "tgt" },
                s3: { bucket: "tgt-bucket" }
            },
            migration: { preset: "v5-to-v6" }
        });

        expect(config.storage).toBe("ddb");
        expect(config.source.dynamodb.tableName).toBe("src");
        expect(config.target.s3.bucket).toBe("tgt-bucket");
        expect(config.migration.preset).toBe("v5-to-v6");
    });

    it("should accept optional segments and modelsDir", () => {
        const config = createDdbTransfer({
            source: {
                region: "us-east-1",
                credentials: creds,
                dynamodb: { tableName: "src" },
                s3: { bucket: "src-bucket" }
            },
            target: {
                region: "us-east-1",
                credentials: creds,
                dynamodb: { tableName: "tgt" },
                s3: { bucket: "tgt-bucket" }
            },
            migration: { preset: "v5-to-v6", segments: 8, modelsDir: "./models" }
        });

        expect(config.migration.segments).toBe(8);
        expect(config.migration.modelsDir).toBe("./models");
    });

    it("should throw on missing source region", () => {
        expect(() =>
            createDdbTransfer({
                source: {
                    credentials: creds,
                    dynamodb: { tableName: "src" },
                    s3: { bucket: "b" }
                } as any,
                target: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "tgt" },
                    s3: { bucket: "b" }
                },
                migration: { preset: "v5-to-v6" }
            })
        ).toThrow();
    });

    it("should throw on missing credentials", () => {
        expect(() =>
            createDdbTransfer({
                source: {
                    region: "us-east-1",
                    dynamodb: { tableName: "src" },
                    s3: { bucket: "b" }
                } as any,
                target: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "tgt" },
                    s3: { bucket: "b" }
                },
                migration: { preset: "v5-to-v6" }
            })
        ).toThrow();
    });

    it("should throw on missing preset", () => {
        expect(() =>
            createDdbTransfer({
                source: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "src" },
                    s3: { bucket: "b" }
                },
                target: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "tgt" },
                    s3: { bucket: "b" }
                },
                migration: {} as any
            })
        ).toThrow();
    });
});

describe("createOsTransfer", () => {
    it("should return a valid os config with storage set", () => {
        const config = createOsTransfer({
            source: {
                region: "us-east-1",
                credentials: creds,
                dynamodb: { tableName: "src-primary" },
                opensearch: { tableName: "src-es" }
            },
            target: {
                region: "eu-central-1",
                credentials: creds,
                opensearch: {
                    endpoint: "https://search-xxx.es.amazonaws.com",
                    tableName: "tgt-es",
                    service: "opensearch"
                }
            },
            migration: { preset: "v5-to-v6-os" }
        });

        expect(config.storage).toBe("os");
        expect(config.source.opensearch.tableName).toBe("src-es");
        expect(config.source.dynamodb.tableName).toBe("src-primary");
        expect(config.target.opensearch.endpoint).toBe("https://search-xxx.es.amazonaws.com");
    });

    it("should accept opensearch-serverless service", () => {
        const config = createOsTransfer({
            source: {
                region: "us-east-1",
                credentials: creds,
                dynamodb: { tableName: "src" },
                opensearch: { tableName: "src-es" }
            },
            target: {
                region: "us-east-1",
                credentials: creds,
                opensearch: {
                    endpoint: "https://xxx.aoss.amazonaws.com",
                    tableName: "tgt-es",
                    service: "opensearch-serverless"
                }
            },
            migration: { preset: "v5-to-v6-os" }
        });

        expect(config.target.opensearch.service).toBe("opensearch-serverless");
    });

    it("should throw on missing source opensearch", () => {
        expect(() =>
            createOsTransfer({
                source: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "src" }
                } as any,
                target: {
                    region: "us-east-1",
                    credentials: creds,
                    opensearch: {
                        endpoint: "https://es.example.com",
                        tableName: "tgt-es",
                        service: "opensearch"
                    }
                },
                migration: { preset: "v5-to-v6-os" }
            })
        ).toThrow();
    });

    it("should throw on missing target opensearch service", () => {
        expect(() =>
            createOsTransfer({
                source: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "src" },
                    opensearch: { tableName: "src-es" }
                },
                target: {
                    region: "us-east-1",
                    credentials: creds,
                    opensearch: {
                        endpoint: "https://es.example.com",
                        tableName: "tgt-es"
                    } as any
                },
                migration: { preset: "v5-to-v6-os" }
            })
        ).toThrow();
    });

    it("should throw on invalid endpoint URL", () => {
        expect(() =>
            createOsTransfer({
                source: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "src" },
                    opensearch: { tableName: "src-es" }
                },
                target: {
                    region: "us-east-1",
                    credentials: creds,
                    opensearch: {
                        endpoint: "not-a-url",
                        tableName: "tgt-es",
                        service: "opensearch"
                    }
                },
                migration: { preset: "v5-to-v6-os" }
            })
        ).toThrow();
    });
});
