import {
  DynamoDBClient as AWSDynamoDBClient,
  ScanCommand,
  QueryCommand
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { DatabaseClient, DatabaseRecord, ScanOptions, QueryOptions } from "./interface.ts";

const BATCH_SIZE = 25; // DynamoDB batch write limit
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 100;

export interface DynamoDBClientOptions {
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  /** Override endpoint (for local testing with dynalite) */
  endpoint?: string;
}

export class DynamoDBClient implements DatabaseClient {
  private client: DynamoDBDocumentClient;

  constructor(options?: DynamoDBClientOptions) {
    const awsClient = new AWSDynamoDBClient({
      region: options?.region || process.env.AWS_REGION || "us-east-1",
      ...(options?.credentials && { credentials: options.credentials }),
      ...(options?.endpoint && { endpoint: options.endpoint })
    });
    this.client = DynamoDBDocumentClient.from(awsClient, {
      marshallOptions: {
        removeUndefinedValues: true
      }
    });
  }

  async *scan(tableName: string, options?: ScanOptions): AsyncIterable<DatabaseRecord> {
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const command = new ScanCommand({
        TableName: tableName,
        Segment: options ? options.segment : undefined,
        TotalSegments: options ? options.totalSegments : undefined,
        ExclusiveStartKey: lastEvaluatedKey
      });

      const response = await this.executeWithRetry(async () => {
        const result = await this.client.send(command);
        return result;
      });

      if (response.Items) {
        for (const item of response.Items) {
          yield this.unmarshall(item) as DatabaseRecord;
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  }

  async query(
    tableName: string,
    pk: string,
    sk?: string,
    options?: QueryOptions
  ): Promise<DatabaseRecord[]> {
    let keyConditionExpression = "PK = :pk";
    const expressionAttributeValues: Record<string, any> = {
      ":pk": { S: pk }
    };

    if (sk) {
      if (
        options &&
        options.sortKeyCondition &&
        options.sortKeyCondition.operator === "beginsWith"
      ) {
        keyConditionExpression += " AND begins_with(SK, :sk)";
      } else {
        keyConditionExpression += " AND SK = :sk";
      }
      expressionAttributeValues[":sk"] = { S: sk };
    }

    const command = new QueryCommand({
      TableName: tableName,
      IndexName: options ? options.indexName : undefined,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: options ? options.limit : undefined
    });

    const response = await this.executeWithRetry(async () => {
      const result = await this.client.send(command);
      return result;
    });

    return (response.Items || []).map(item => this.unmarshall(item) as DatabaseRecord);
  }

  async put(tableName: string, record: DatabaseRecord): Promise<void> {
    const command = new PutCommand({
      TableName: tableName,
      Item: record
    });

    await this.executeWithRetry(async () => {
      await this.client.send(command);
    });
  }

  async batchPut(tableName: string, records: DatabaseRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    // Split into batches of 25
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      const command = new BatchWriteCommand({
        RequestItems: {
          [tableName]: batch.map(record => ({
            PutRequest: {
              Item: record
            }
          }))
        }
      });

      await this.executeWithRetry(async () => {
        const response = await this.client.send(command);

        // Handle unprocessed items
        if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
          const unprocessedItems = response.UnprocessedItems[tableName];
          if (unprocessedItems) {
            const unprocessedRecords = unprocessedItems.map(
              item => item.PutRequest!.Item as DatabaseRecord
            );
            if (unprocessedRecords && unprocessedRecords.length > 0) {
              // Recursively retry unprocessed items
              await this.batchPut(tableName, unprocessedRecords);
            }
          }
        }
      });
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable (throttling, temporary errors)
        const isRetryable =
          error instanceof Error &&
          (error.name === "ProvisionedThroughputExceededException" ||
            error.name === "ThrottlingException" ||
            error.name === "RequestLimitExceeded");

        if (!isRetryable || attempt === MAX_RETRIES - 1) {
          throw error;
        }

        // Exponential backoff
        const backoff = INITIAL_BACKOFF * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw lastError;
  }

  private unmarshall(item: Record<string, any>): Record<string, any> {
    // Convert DynamoDB format to plain object
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(item)) {
      if (value.S !== undefined) {
        result[key] = value.S;
      } else if (value.N !== undefined) {
        result[key] = Number(value.N);
      } else if (value.BOOL !== undefined) {
        result[key] = value.BOOL;
      } else if (value.NULL !== undefined) {
        result[key] = null;
      } else if (value.M !== undefined) {
        result[key] = this.unmarshall(value.M);
      } else if (value.L !== undefined) {
        result[key] = value.L.map((v: any) => this.unmarshall({ v }).v);
      } else if (value.SS !== undefined) {
        result[key] = value.SS;
      } else if (value.NS !== undefined) {
        result[key] = value.NS.map(Number);
      } else if (value.BS !== undefined) {
        result[key] = value.BS;
      }
    }

    return result;
  }
}
