import { StorageClient, CopyOptions } from "../../src/storage/interface.ts";

/**
 * Mock StorageClient for testing
 */
export class MockStorageClient implements StorageClient {
  public copyOperations: CopyOptions[] = [];

  async copy(options: CopyOptions): Promise<void> {
    this.copyOperations.push(options);
  }

  async batchCopy(operations: CopyOptions[]): Promise<void> {
    this.copyOperations.push(...operations);
  }

  // Test helper methods
  getCopyOperations(): CopyOptions[] {
    return this.copyOperations;
  }

  clearCopyOperations(): void {
    this.copyOperations = [];
  }
}
