import type { Command } from "./Command.ts";
interface CreateParams {
  sourceBucket: string;
  sourceKey: string;
  targetBucket: string;
  targetKey: string;
}
export declare class S3Copy implements Command {
  readonly sourceBucket: string;
  readonly sourceKey: string;
  readonly targetBucket: string;
  readonly targetKey: string;
  static readonly key = "S3_COPY";
  readonly key = "S3_COPY";
  readonly dedupKey: undefined;
  private constructor();
  static create(params: CreateParams): S3Copy;
}
export {};
//# sourceMappingURL=S3Copy.d.ts.map
