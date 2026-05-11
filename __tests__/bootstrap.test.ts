import { describe, it, expect } from "vitest";
import { bootstrap } from "../src/bootstrap.ts";
import { MigrationConfig } from "../src/features/MigrationConfig/index.ts";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "../src/services/DynamoDbClient/index.ts";
import { Logger } from "../src/tools/Logger/index.ts";
import { Cache } from "../src/tools/Cache/index.ts";
import { ModelProvider } from "../src/features/ModelProvider/index.ts";
import { TenantLocales } from "../src/features/TenantLocales/index.ts";
import { SourceS3Client, TargetS3Client } from "../src/services/S3Client/index.ts";
import { PresetLoader } from "../src/features/PresetLoader/index.ts";
import { WorkerSpawner } from "../src/features/WorkerSpawner/index.ts";
import { DirectoryTool } from "../src/tools/DirectoryTool/index.ts";
import { FileTool } from "../src/tools/FileTool/index.ts";
import { OpenSearchClient } from "../src/services/OpenSearchClient/index.ts";

const creds = { accessKeyId: "test", secretAccessKey: "test" };

const ddbOnlyConfig: MigrationConfig.Interface = {
    source: {
        region: "us-east-1",
        credentials: creds,
        dynamodb: { tableName: "source-table" },
        s3: { bucket: "source-bucket" }
    },
    target: {
        region: "eu-central-1",
        credentials: creds,
        dynamodb: { tableName: "target-table" },
        s3: { bucket: "target-bucket" },
        auditLog: null
    },
    pipeline: {}
};

const fullConfig: MigrationConfig.Interface = {
    source: {
        region: "us-east-1",
        credentials: creds,
        dynamodb: { tableName: "source-primary" },
        s3: { bucket: "source-bucket" },
        opensearch: { tableName: "source-os" }
    },
    target: {
        region: "eu-central-1",
        credentials: creds,
        dynamodb: { tableName: "target-table" },
        s3: { bucket: "target-bucket" },
        opensearch: {
            endpoint: "https://es.example.com",
            tableName: "target-os",
            service: "opensearch" as const,
            indexPrefix: ""
        }
    },
    pipeline: {}
};

describe("bootstrap — DDB-only config", () => {
    it("resolves all core features", () => {
        const container = bootstrap({ config: ddbOnlyConfig });
        expect(container.resolve(MigrationConfig)).toBeDefined();
        expect(container.resolve(Logger)).toBeDefined();
        expect(container.resolve(Cache)).toBeDefined();
        expect(container.resolve(DirectoryTool)).toBeDefined();
        expect(container.resolve(FileTool)).toBeDefined();
        expect(container.resolve(SourceDynamoDbClient)).toBeDefined();
        expect(container.resolve(TargetDynamoDbClient)).toBeDefined();
        expect(container.resolve(SourceS3Client)).toBeDefined();
        expect(container.resolve(TargetS3Client)).toBeDefined();
        expect(container.resolve(ModelProvider)).toBeDefined();
        expect(container.resolve(TenantLocales)).toBeDefined();
        expect(container.resolve(PresetLoader)).toBeDefined();
        expect(container.resolve(WorkerSpawner)).toBeDefined();
    });

    it("does NOT register OpenSearchClient when opensearch is absent", () => {
        const container = bootstrap({ config: ddbOnlyConfig });
        expect(() => container.resolve(OpenSearchClient)).toThrow();
    });
});

describe("bootstrap — full config (DDB + OS)", () => {
    it("resolves OpenSearchClient when target.opensearch is set", () => {
        const container = bootstrap({ config: fullConfig });
        expect(container.resolve(OpenSearchClient)).toBeDefined();
    });

    it("also resolves S3 clients in full config", () => {
        const container = bootstrap({ config: fullConfig });
        expect(container.resolve(SourceS3Client)).toBeDefined();
        expect(container.resolve(TargetS3Client)).toBeDefined();
    });
});

describe("bootstrap — singleton behavior", () => {
    it("returns same instance on multiple resolves", () => {
        const container = bootstrap({ config: ddbOnlyConfig });
        expect(container.resolve(Logger)).toBe(container.resolve(Logger));
        expect(container.resolve(Cache)).toBe(container.resolve(Cache));
        expect(container.resolve(SourceDynamoDbClient)).toBe(
            container.resolve(SourceDynamoDbClient)
        );
    });
});
