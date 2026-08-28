import { describe, it, expect } from "vitest";
import { SourceS3Client, TargetS3Client } from "../../../src/services/S3Client/index.ts";
import { S3ClientImpl } from "../../../src/services/S3Client/S3Client.ts";
import { createDdbContainer } from "../../containers/index.ts";
import { NoopLogger } from "../../helpers/NoopLogger.ts";

describe("S3Client Feature", () => {
    describe("cross-account isolation", () => {
        it("should create distinct underlying clients when credentials are provider functions", () => {
            const sourceProvider = async () => ({
                accessKeyId: "source-key",
                secretAccessKey: "source-secret"
            });
            const targetProvider = async () => ({
                accessKeyId: "target-key",
                secretAccessKey: "target-secret"
            });

            const source = new S3ClientImpl(
                { region: "us-east-1", credentials: sourceProvider },
                new NoopLogger()
            );
            const target = new S3ClientImpl(
                { region: "us-east-1", credentials: targetProvider },
                new NoopLogger()
            );

            const sourceInternal = (source as unknown as { client: unknown }).client;
            const targetInternal = (target as unknown as { client: unknown }).client;

            expect(sourceInternal).not.toBe(targetInternal);
        });
    });

    describe("DI registration", () => {
        it("should resolve SourceS3Client", () => {
            const container = createDdbContainer();
            const client = container.resolve(SourceS3Client);
            expect(client).toBeDefined();
            expect(typeof client.copy).toBe("function");
            expect(typeof client.batchCopy).toBe("function");
            expect(typeof client.getObject).toBe("function");
        });

        it("should resolve TargetS3Client", () => {
            const container = createDdbContainer();
            const client = container.resolve(TargetS3Client);
            expect(client).toBeDefined();
            expect(typeof client.copy).toBe("function");
            expect(typeof client.batchCopy).toBe("function");
            expect(typeof client.getObject).toBe("function");
        });

        it("should return different instances for source and target", () => {
            const container = createDdbContainer();
            expect(container.resolve(SourceS3Client)).not.toBe(container.resolve(TargetS3Client));
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(SourceS3Client)).toBe(container.resolve(SourceS3Client));
        });
    });

    describe("batchCopy", () => {
        it("should handle empty operations array", async () => {
            const container = createDdbContainer();
            await container.resolve(SourceS3Client).batchCopy([]);
        });
    });
});
