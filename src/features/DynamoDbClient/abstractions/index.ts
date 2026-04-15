export {
  SourceDynamoDbClient,
  TargetDynamoDbClient,
  type IDynamoDbClient,
  type DatabaseRecord,
  type ScanOptions,
  type QueryOptions
} from "./DynamoDbClient.ts";

export {
  DynamoDbClientConfig,
  type IDynamoDbClientConfig,
  type DynamoDbConnectionConfig,
  type AwsCredentials
} from "./DynamoDbClientConfig.ts";
