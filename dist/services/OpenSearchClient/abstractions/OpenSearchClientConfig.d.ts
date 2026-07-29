interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Populated when credentials come from a provider that rotates them. */
  expiration?: Date;
}
type AwsCredentialsProvider = () => Promise<AwsCredentials>;
export interface IOpenSearchClientConfig {
  endpoint: string;
  region: string;
  service: "opensearch" | "opensearch-serverless";
  credentials: AwsCredentials | AwsCredentialsProvider;
  maxRetries?: number;
}
export declare const OpenSearchClientConfig: import("@webiny/di").Abstraction<IOpenSearchClientConfig>;
export declare namespace OpenSearchClientConfig {
  type Interface = IOpenSearchClientConfig;
  type Credentials = AwsCredentials;
  type CredentialsProvider = AwsCredentialsProvider;
}
export {};
//# sourceMappingURL=OpenSearchClientConfig.d.ts.map
