export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Populated when credentials come from a provider that rotates them. */
  expiration?: Date;
}
export type AwsCredentialsProvider = () => Promise<AwsCredentials>;
export interface DynamoDbConnectionConfig {
  region: string;
  /**
   * Either a literal credentials object, or an AWS SDK credential-
   * provider function (e.g. `fromAwsProfile`). Optional because
   * integration tests default to dynalite with dummy creds — user
   * config requires it via the Zod schema.
   */
  credentials?: AwsCredentials | AwsCredentialsProvider;
  /** Override endpoint (for local testing with dynalite) */
  endpoint?: string;
}
export interface DynamoDbTuning {
  maxRetries?: number;
  initialBackoffMs?: number;
  requestTimeoutMs?: number;
}
export interface IDynamoDbClientConfig {
  source: DynamoDbConnectionConfig;
  target: DynamoDbConnectionConfig;
  tuning?: DynamoDbTuning;
}
export declare const DynamoDbClientConfig: import("@webiny/di").Abstraction<IDynamoDbClientConfig>;
export declare namespace DynamoDbClientConfig {
  type Interface = IDynamoDbClientConfig;
  type Connection = DynamoDbConnectionConfig;
  type Credentials = AwsCredentials;
  type Tuning = DynamoDbTuning;
}
//# sourceMappingURL=DynamoDbClientConfig.d.ts.map
