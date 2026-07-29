import { SourceDynamoDbClient } from "./abstractions/DynamoDbClient.ts";
import { DynamoDbClientConfig } from "./abstractions/DynamoDbClientConfig.ts";
import type { Logger } from "../../tools/Logger/abstractions/Logger.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
export declare class DynamoDbClientImpl implements SourceDynamoDbClient.Interface {
  private client;
  private readonly maxRetries;
  private readonly initialBackoff;
  private readonly requestTimeout;
  private readonly logger;
  constructor(
    config: DynamoDbClientConfig.Connection,
    logger: Logger.Interface,
    tuning?: DynamoDbClientConfig.Tuning
  );
  scan<T extends SourceDynamoDbClient.Record = BaseRecord>(
    tableName: string,
    options?: SourceDynamoDbClient.Scan
  ): AsyncIterable<T>;
  query<T extends SourceDynamoDbClient.Record>(
    tableName: string,
    pk: string,
    sk?: string,
    options?: SourceDynamoDbClient.Query
  ): Promise<T[]>;
  queryAll<T extends SourceDynamoDbClient.Record>(
    tableName: string,
    pk: string,
    sk?: string,
    options?: SourceDynamoDbClient.Query
  ): Promise<T[]>;
  get<T extends SourceDynamoDbClient.Record>(
    tableName: string,
    pk: string,
    sk: string
  ): Promise<T | null>;
  batchPut<T extends SourceDynamoDbClient.Record>(tableName: string, records: T[]): Promise<void>;
  private withTimeout;
  private executeWithRetry;
}
//# sourceMappingURL=DynamoDbClient.d.ts.map
