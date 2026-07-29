import { S3 } from "@webiny/aws-sdk/client-s3/index.js";
import { Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { isAccessDeniedError } from "../../base/index.js";
import { SourceS3Client, TargetS3Client } from "../../services/S3Client/abstractions/S3Client.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { S3Copy } from "../../domain/transform/commands/S3Copy.js";
class S3ProcessorImpl {
  sourceS3;
  targetS3;
  config;
  transferContext;
  constructor(sourceS3, targetS3, config, transferContext) {
    this.sourceS3 = sourceS3;
    this.targetS3 = targetS3;
    this.config = config;
    this.transferContext = transferContext;
  }
  extendContext(base) {
    const sourceBucket = this.config.source.s3.bucket;
    const targetBucket = this.config.target.s3.bucket;
    const sourceS3 = this.sourceS3;
    return {
      copyFile(sourceKey, targetKey) {
        base.addCommand(S3Copy.create({ sourceBucket, sourceKey, targetBucket, targetKey }));
      },
      async getFile(key) {
        return sourceS3.getObject(sourceBucket, key);
      }
    };
  }
  // No onEnd — S3 has no sensible per-record default. Transformers call
  // ctx.copyFile(...) explicitly when they want to emit a copy.
  async checkAccess() {
    const sourceAccount = this.config.source.accountId || null;
    const targetAccount = this.config.target.accountId || null;
    const isCrossAccount =
      sourceAccount !== null && targetAccount !== null && sourceAccount !== targetAccount;
    const checks = [
      this.headBucket(
        this.config.source.credentials,
        this.config.source.region,
        this.config.source.s3.bucket,
        "source"
      ),
      this.headBucket(
        this.config.target.credentials,
        this.config.target.region,
        this.config.target.s3.bucket,
        "target"
      )
    ];
    if (isCrossAccount) {
      checks.push(
        this.headBucketWithLabel(
          this.config.target.credentials,
          this.config.source.region,
          this.config.source.s3.bucket,
          `S3 cross-account read (target credentials → source bucket: ${this.config.source.s3.bucket})`,
          `S3 CopyObject runs with target credentials. Add a bucket policy on ` +
            `"${this.config.source.s3.bucket}" granting s3:GetObject to account ${targetAccount}.`
        )
      );
    }
    return Promise.all(checks);
  }
  headBucket(credentials, region, bucket, side) {
    return this.headBucketWithLabel(credentials, region, bucket, `S3 ${side} bucket: ${bucket}`);
  }
  async headBucketWithLabel(credentials, region, bucket, label, hint) {
    const client = new S3({ region, credentials: credentials });
    try {
      await client.headBucket({ Bucket: bucket });
      return { label, status: "ok" };
    } catch (error) {
      if (isAccessDeniedError(error)) {
        return { label, status: "denied", hint };
      }
      const errName = error.name ?? error.code;
      const httpStatus = error.$metadata?.httpStatusCode;
      if (errName === "NoSuchBucket" || httpStatus === 404) {
        return { label, status: "missing", hint };
      }
      return { label, status: "unknown" };
    } finally {
      client.destroy();
    }
  }
  async execute(commands) {
    if (this.transferContext.dryRun) {
      return;
    }
    const copies = commands.get(S3Copy.key);
    if (copies.length === 0) {
      return;
    }
    await this.targetS3.batchCopy(
      copies.map(c => ({
        sourceBucket: c.sourceBucket,
        sourceKey: c.sourceKey,
        targetBucket: c.targetBucket,
        targetKey: c.targetKey
      }))
    );
  }
}
export const S3Processor = Processor.createImplementation({
  implementation: S3ProcessorImpl,
  dependencies: [SourceS3Client, TargetS3Client, MigrationConfig, TransferContext]
});
//# sourceMappingURL=S3Processor.js.map
