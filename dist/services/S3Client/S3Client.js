import {
  CopyObjectCommand,
  GetObjectCommand,
  createS3Client
} from "@webiny/aws-sdk/client-s3/index.js";
import {
  isRetryableAwsError,
  isThrottlingError,
  isTokenBucketExhausted,
  retryBackoffMs
} from "../../base/index.js";
// See DynamoDbClient for the rationale on 6 retries + the jittered
// capped backoff. S3 mirrors the DDB defaults for consistency — same
// underlying SDK retry semantics, same class of server-side hiccups.
const DEFAULT_MAX_RETRIES = 6;
const DEFAULT_INITIAL_BACKOFF = 100;
const DEFAULT_CONCURRENCY = 10;
// S3 file copies can be large; 60 s is generous enough for typical FM assets
// while still converting infinite hangs (stale TCP, silent gateway drop) into
// a visible error.
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export class S3ClientImpl {
  client;
  maxRetries;
  initialBackoff;
  concurrency;
  requestTimeout;
  logger;
  constructor(config, logger, tuning) {
    this.logger = logger;
    this.client = createS3Client({
      region: config.region,
      credentials: config.credentials,
      retryMode: "adaptive"
    });
    this.maxRetries = tuning?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialBackoff = tuning?.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF;
    this.concurrency = tuning?.concurrency ?? DEFAULT_CONCURRENCY;
    this.requestTimeout = tuning?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }
  async copy(options) {
    const command = new CopyObjectCommand({
      CopySource: `${options.sourceBucket}/${options.sourceKey}`,
      Bucket: options.targetBucket,
      Key: options.targetKey
    });
    try {
      await this.executeWithRetry(async () => {
        await this.client.send(command);
      });
    } catch (error) {
      if (this.isNoSuchKeyError(error)) {
        this.logger.warn(
          `S3 copy skipped — source key not found: ${options.sourceBucket}/${options.sourceKey}`
        );
        return;
      }
      throw error;
    }
  }
  async getObject(bucket, key) {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return this.executeWithRetry(async () => {
      const response = await this.client.send(command);
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    });
  }
  async batchCopy(operations) {
    if (operations.length === 0) {
      return;
    }
    for (let i = 0; i < operations.length; i += this.concurrency) {
      const batch = operations.slice(i, i + this.concurrency);
      await Promise.all(
        batch.map(async op => {
          try {
            await this.copy(op);
          } catch (error) {
            this.logger.error(
              `S3 copy failed after ${this.maxRetries + 1} attempts — ` +
                `${op.sourceBucket}/${op.sourceKey} → ` +
                `${op.targetBucket}/${op.targetKey}`
            );
            throw error;
          }
        })
      );
    }
  }
  isNoSuchKeyError(error) {
    if (!error || typeof error !== "object") {
      return false;
    }
    const err = error;
    return err.name === "NoSuchKey" || err.Code === "NoSuchKey";
  }
  withTimeout(fn) {
    const ms = this.requestTimeout;
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`S3 request timed out after ${ms}ms`)), ms)
      )
    ]);
  }
  async executeWithRetry(fn) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.withTimeout(fn);
      } catch (error) {
        lastError = error;
        if (!isRetryableAwsError(error) || attempt === this.maxRetries) {
          throw error;
        }
        const base = retryBackoffMs(attempt, this.initialBackoff);
        const backoff = isTokenBucketExhausted(error) ? Math.max(base, 10000) : base;
        const err = error;
        if (isThrottlingError(error)) {
          this.logger.debug(
            `S3 throttled — ${err.name ?? "ThrottlingError"} (attempt ${attempt + 1}/${this.maxRetries}, backoff ${backoff}ms)`
          );
        } else {
          this.logger.warn(
            `S3 retry ${attempt + 1}/${this.maxRetries}: ${err.name ?? "Error"} — ${err.message ?? String(error)} (backoff ${backoff}ms)`
          );
        }
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
    throw lastError;
  }
}
//# sourceMappingURL=S3Client.js.map
