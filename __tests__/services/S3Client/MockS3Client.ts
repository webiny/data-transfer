import type { SourceS3Client } from "~/services/S3Client/abstractions/S3Client.ts";

/**
 * In-memory mock for SourceS3Client / TargetS3Client.
 * Tracks calls so tests can assert behavior.
 */
export class MockS3Client implements SourceS3Client.Interface {
    public copies: SourceS3Client.Copy[] = [];
    public objects: Map<string, Buffer> = new Map();

    public async copy(options: SourceS3Client.Copy): Promise<void> {
        this.copies.push(options);
    }

    public async batchCopy(operations: SourceS3Client.Copy[]): Promise<void> {
        for (const op of operations) {
            this.copies.push(op);
        }
    }

    public async getObject(bucket: string, key: string): Promise<Buffer> {
        const stored = this.objects.get(`${bucket}/${key}`);
        if (!stored) {
            throw new Error(`No object at ${bucket}/${key}`);
        }
        return stored;
    }

    // Test helpers
    public putObject(bucket: string, key: string, data: Buffer): void {
        this.objects.set(`${bucket}/${key}`, data);
    }

    public clear(): void {
        this.copies = [];
        this.objects.clear();
    }
}
