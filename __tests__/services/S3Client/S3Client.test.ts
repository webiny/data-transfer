import { describe, it, expect } from "vitest";
import { SourceS3Client, TargetS3Client } from "../../../src/services/S3Client/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

describe("S3Client Feature", () => {
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
