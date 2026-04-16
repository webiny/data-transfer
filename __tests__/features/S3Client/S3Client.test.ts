import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import {
    SourceS3Client,
    TargetS3Client,
    S3ClientConfig,
    S3ClientFeature
} from "../../../src/features/S3Client/index.ts";

describe("S3Client Feature", () => {
    const config: S3ClientConfig.Interface = {
        source: {
            region: "us-east-1",
            credentials: { accessKeyId: "src-key", secretAccessKey: "src-secret" }
        },
        target: {
            region: "eu-central-1",
            credentials: { accessKeyId: "tgt-key", secretAccessKey: "tgt-secret" }
        }
    };

    function createContainer(): Container {
        const container = new Container();
        container.registerInstance(S3ClientConfig, config);
        S3ClientFeature.register(container);
        return container;
    }

    describe("DI registration", () => {
        it("should resolve SourceS3Client", () => {
            const container = createContainer();
            const client = container.resolve(SourceS3Client);
            expect(client).toBeDefined();
            expect(typeof client.copy).toBe("function");
            expect(typeof client.batchCopy).toBe("function");
            expect(typeof client.getObject).toBe("function");
        });

        it("should resolve TargetS3Client", () => {
            const container = createContainer();
            const client = container.resolve(TargetS3Client);
            expect(client).toBeDefined();
            expect(typeof client.copy).toBe("function");
            expect(typeof client.batchCopy).toBe("function");
            expect(typeof client.getObject).toBe("function");
        });

        it("should return different instances for source and target", () => {
            const container = createContainer();
            const source = container.resolve(SourceS3Client);
            const target = container.resolve(TargetS3Client);
            expect(source).not.toBe(target);
        });

        it("should return same instance on multiple resolves", () => {
            const container = createContainer();
            const first = container.resolve(SourceS3Client);
            const second = container.resolve(SourceS3Client);
            expect(first).toBe(second);
        });
    });

    describe("batchCopy", () => {
        it("should handle empty operations array", async () => {
            const container = createContainer();
            const client = container.resolve(SourceS3Client);
            // Should not throw
            await client.batchCopy([]);
        });
    });
});
