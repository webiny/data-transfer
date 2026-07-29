import { SourceS3Client } from "./abstractions/S3Client.ts";
import { S3ClientConfig } from "./abstractions/S3ClientConfig.ts";
import type { Logger } from "../../tools/Logger/abstractions/Logger.js";
export declare class S3ClientImpl implements SourceS3Client.Interface {
  private client;
  private readonly maxRetries;
  private readonly initialBackoff;
  private readonly concurrency;
  private readonly requestTimeout;
  private readonly logger;
  constructor(
    config: S3ClientConfig.Connection,
    logger: Logger.Interface,
    tuning?: S3ClientConfig.Tuning
  );
  copy(options: SourceS3Client.Copy): Promise<void>;
  getObject(bucket: string, key: string): Promise<Buffer>;
  batchCopy(operations: SourceS3Client.Copy[]): Promise<void>;
  private isNoSuchKeyError;
  private withTimeout;
  private executeWithRetry;
}
//# sourceMappingURL=S3Client.d.ts.map
