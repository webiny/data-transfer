import { StorageClient, CopyOptions } from "../../src/storage/interface.ts";

/**
 * Mock StorageClient for testing
 */
export class MockStorageClient implements StorageClient {
  public copyOperations: CopyOptions[] = [];
  private files: Map<string, Buffer> = new Map();

  async copy(options: CopyOptions): Promise<void> {
    this.copyOperations.push(options);
  }

  async batchCopy(operations: CopyOptions[]): Promise<void> {
    this.copyOperations.push(...operations);
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const stored = this.files.get(`${bucket}/${key}`);
    if (!stored) {
      throw new Error(`NoSuchKey: ${bucket}/${key}`);
    }
    return stored;
  }

  // Test helper methods
  putFile(bucket: string, key: string, data: Buffer): void {
    this.files.set(`${bucket}/${key}`, data);
  }

  getCopyOperations(): CopyOptions[] {
    return this.copyOperations;
  }

  clearCopyOperations(): void {
    this.copyOperations = [];
  }
}
