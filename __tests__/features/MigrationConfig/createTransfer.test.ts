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
            pipeline: { preset: "v5-to-v6" }
        });

        expect(config.storage).toBe("ddb");
        expect(config.source.dynamodb.tableName).toBe("src");
        expect(config.target.s3.bucket).toBe("tgt-bucket");
        expect(config.pipeline.preset).toBe("v5-to-v6");
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
            pipeline: { preset: "v5-to-v6", segments: 8, modelsDir: "./models" }
        });

        expect(config.pipeline.segments).toBe(8);
        expect(config.pipeline.modelsDir).toBe("./models");
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
                pipeline: { preset: "v5-to-v6" }
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
                pipeline: { preset: "v5-to-v6" }
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
                pipeline: {} as any
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
            pipeline: { preset: "v5-to-v6-os" }
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
            pipeline: { preset: "v5-to-v6-os" }
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
                pipeline: { preset: "v5-to-v6-os" }
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
                pipeline: { preset: "v5-to-v6-os" }
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
                pipeline: { preset: "v5-to-v6-os" }
            })
        ).toThrow();
    });
});

describe("createDdbTransfer — source/target collision guard", () => {
    const baseDdbSource = {
        region: "us-east-1",
        credentials: creds,
        dynamodb: { tableName: "src-table" },
        s3: { bucket: "src-bucket" }
    };
    const baseDdbTarget = {
        region: "eu-central-1",
        credentials: creds,
        dynamodb: { tableName: "tgt-table" },
        s3: { bucket: "tgt-bucket" }
    };

    it("rejects same S3 bucket for source and target", () => {
        expect(() =>
            createDdbTransfer({
                source: baseDdbSource,
                target: { ...baseDdbTarget, s3: { bucket: baseDdbSource.s3.bucket } },
                pipeline: { preset: "v5-to-v6" }
            })
        ).toThrow(/same as source/);
    });

    it("rejects same region + same DDB table for source and target", () => {
        expect(() =>
            createDdbTransfer({
                source: baseDdbSource,
                target: {
                    ...baseDdbTarget,
                    region: baseDdbSource.region,
                    dynamodb: { tableName: baseDdbSource.dynamodb.tableName }
                },
                pipeline: { preset: "v5-to-v6" }
            })
        ).toThrow(/matches source/);
    });

    it("accepts same DDB table name across different regions", () => {
        expect(() =>
            createDdbTransfer({
                source: baseDdbSource,
                target: {
                    ...baseDdbTarget,
                    // different region, same table name — distinct physical tables
                    dynamodb: { tableName: baseDdbSource.dynamodb.tableName }
                },
                pipeline: { preset: "v5-to-v6" }
            })
        ).not.toThrow();
    });
});

describe("createDdbTransfer — string trimming", () => {
    it("trims whitespace around string fields (paste-error tolerance)", () => {
        const config = createDdbTransfer({
            source: {
                region: "  us-east-1\t",
                credentials: creds,
                dynamodb: { tableName: "  src-table  " },
                s3: { bucket: " src-bucket\n" }
            },
            target: {
                region: " eu-central-1 ",
                credentials: creds,
                dynamodb: { tableName: "tgt-table " },
                s3: { bucket: " tgt-bucket " }
            },
            pipeline: { preset: "  v5-to-v6-ddb " }
        });

        expect(config.source.region).toBe("us-east-1");
        expect(config.source.dynamodb.tableName).toBe("src-table");
        expect(config.source.s3.bucket).toBe("src-bucket");
        expect(config.target.region).toBe("eu-central-1");
        expect(config.target.dynamodb.tableName).toBe("tgt-table");
        expect(config.target.s3.bucket).toBe("tgt-bucket");
        expect(config.pipeline.preset).toBe("v5-to-v6-ddb");
    });

    it("rejects whitespace-only strings (empty after trim)", () => {
        expect(() =>
            createDdbTransfer({
                source: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "   " },
                    s3: { bucket: "src-bucket" }
                },
                target: {
                    region: "eu-central-1",
                    credentials: creds,
                    dynamodb: { tableName: "tgt-table" },
                    s3: { bucket: "tgt-bucket" }
                },
                pipeline: { preset: "v5-to-v6-ddb" }
            })
        ).toThrow();
    });

    it("collision guard runs against TRIMMED values (trailing-space doesn't mask a same-table mistake)", () => {
        expect(() =>
            createDdbTransfer({
                source: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "same-table" },
                    s3: { bucket: "src-bucket" }
                },
                target: {
                    region: "us-east-1",
                    credentials: creds,
                    dynamodb: { tableName: "same-table " },
                    s3: { bucket: "tgt-bucket" }
                },
                pipeline: { preset: "v5-to-v6-ddb" }
            })
        ).toThrow(/matches source/);
    });
});

describe("createOsTransfer — source/target collision guard", () => {
    const baseOsSource = {
        region: "us-east-1",
        credentials: creds,
        dynamodb: { tableName: "src-primary" },
        opensearch: { tableName: "src-es-table" }
    };
    const baseOsTarget = {
        region: "eu-central-1",
        credentials: creds,
        opensearch: {
            endpoint: "https://search-xxx.example.com",
            tableName: "tgt-es-table",
            service: "opensearch" as const
        }
    };

    it("rejects same region + same OS DDB table for source and target", () => {
        expect(() =>
            createOsTransfer({
                source: baseOsSource,
                target: {
                    ...baseOsTarget,
                    region: baseOsSource.region,
                    opensearch: {
                        ...baseOsTarget.opensearch,
                        tableName: baseOsSource.opensearch.tableName
                    }
                },
                pipeline: { preset: "v5-to-v6-os" }
            })
        ).toThrow(/matches source/);
    });

    it("accepts same OS table name across different regions", () => {
        expect(() =>
            createOsTransfer({
                source: baseOsSource,
                target: {
                    ...baseOsTarget,
                    opensearch: {
                        ...baseOsTarget.opensearch,
                        tableName: baseOsSource.opensearch.tableName
                    }
                },
                pipeline: { preset: "v5-to-v6-os" }
            })
        ).not.toThrow();
    });
});
