interface CopyOptions {
  sourceBucket: string;
  sourceKey: string;
  targetBucket: string;
  targetKey: string;
}
interface IS3Client {
  copy(options: CopyOptions): Promise<void>;
  batchCopy(operations: CopyOptions[]): Promise<void>;
  getObject(bucket: string, key: string): Promise<Buffer>;
}
export declare const SourceS3Client: import("@webiny/di").Abstraction<IS3Client>;
export declare const TargetS3Client: import("@webiny/di").Abstraction<IS3Client>;
export declare namespace SourceS3Client {
  type Interface = IS3Client;
  type Copy = CopyOptions;
}
export declare namespace TargetS3Client {
  type Interface = IS3Client;
  type Copy = CopyOptions;
}
export {};
//# sourceMappingURL=S3Client.d.ts.map
