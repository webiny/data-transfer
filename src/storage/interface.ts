// ============================================================================
// Storage Abstraction
// ============================================================================

export interface CopyOptions {
  sourceBucket: string;
  sourceKey: string;
  targetBucket: string;
  targetKey: string;
}

export interface StorageClient {
  /** Copy object from source to target */
  copy(options: CopyOptions): Promise<void>;

  /** Batch copy with concurrency control */
  batchCopy(operations: CopyOptions[]): Promise<void>;

  /** Get object contents from S3 */
  getObject(bucket: string, key: string): Promise<Buffer>;
}
