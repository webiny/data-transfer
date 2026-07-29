export class S3Copy {
  sourceBucket;
  sourceKey;
  targetBucket;
  targetKey;
  static key = "S3_COPY";
  key = S3Copy.key;
  dedupKey = undefined;
  constructor(sourceBucket, sourceKey, targetBucket, targetKey) {
    this.sourceBucket = sourceBucket;
    this.sourceKey = sourceKey;
    this.targetBucket = targetBucket;
    this.targetKey = targetKey;
  }
  static create(params) {
    return new S3Copy(params.sourceBucket, params.sourceKey, params.targetBucket, params.targetKey);
  }
}
//# sourceMappingURL=S3Copy.js.map
