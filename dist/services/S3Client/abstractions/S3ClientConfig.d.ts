interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Populated when credentials come from a provider that rotates them. */
  expiration?: Date;
}
type AwsCredentialsProvider = () => Promise<AwsCredentials>;
interface S3ConnectionConfig {
  region: string;
  credentials?: AwsCredentials | AwsCredentialsProvider;
}
interface S3Tuning {
  concurrency?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
  requestTimeoutMs?: number;
}
interface IS3ClientConfig {
  source: S3ConnectionConfig;
  target: S3ConnectionConfig;
  tuning?: S3Tuning;
}
export declare const S3ClientConfig: import("@webiny/di").Abstraction<IS3ClientConfig>;
export declare namespace S3ClientConfig {
  type Interface = IS3ClientConfig;
  type Connection = S3ConnectionConfig;
  type Credentials = AwsCredentials;
  type Tuning = S3Tuning;
}
export {};
//# sourceMappingURL=S3ClientConfig.d.ts.map
