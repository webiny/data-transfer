import {
  BatchWriteCommand,
  GetCommand,
  ScanCommand,
  getDocumentClient
} from "@webiny/aws-sdk/client-dynamodb/index.js";
// QueryCommand: @webiny/aws-sdk/client-dynamodb re-exports the LOW-LEVEL
// variant from @aws-sdk/client-dynamodb, which expects pre-marshalled
// AttributeValue inputs. Our code passes plain JS values and relies on
// DocumentClient auto-marshalling, which requires the lib-dynamodb variant.
// Imported directly here until @webiny/aws-sdk's export is fixed.
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  isRetryableAwsError,
  isThrottlingError,
  isTokenBucketExhausted,
  retryBackoffMs
} from "../../base/index.js";
const BATCH_SIZE = 25; // AWS-enforced BatchWriteItem limit — not user-tunable
// Default retry budget — enough to weather a multi-second transient
// (100 / 200 / 400 / 800 / 1600 / 3200 ms base; +±25% jitter ≈ 4.7-7.9 s
// total). AWS's adaptive retry middleware only auto-retries on
// throttling flags, so our outer loop carries most of the server-error
// coverage.
const DEFAULT_MAX_RETRIES = 6;
const DEFAULT_INITIAL_BACKOFF = 100;
// A batchPut of 25 records should complete in <5 s under any reasonable
// load. 30 s is generous enough to survive severe throttling bursts while
// still converting infinite hangs (stale TCP, silent gateway drop) into a
// visible error.
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export class DynamoDbClientImpl {
  client;
  maxRetries;
  initialBackoff;
  requestTimeout;
  logger;
  constructor(config, logger, tuning) {
    this.logger = logger;
    // getDocumentClient bakes in marshall options (convertEmptyValues,
    // removeUndefinedValues, convertClassInstanceToMap) and caches by
    // config hash — no manual DynamoDBClient/DynamoDBDocument wiring.
    this.client = getDocumentClient({
      region: config.region,
      ...(config.credentials && { credentials: config.credentials }),
      ...(config.endpoint && { endpoint: config.endpoint }),
      retryMode: "adaptive"
    });
    this.maxRetries = tuning?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialBackoff = tuning?.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF;
    this.requestTimeout = tuning?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }
  async *scan(tableName, options) {
    let lastEvaluatedKey;
    do {
      const command = new ScanCommand({
        TableName: tableName,
        Segment: options ? options.segment : undefined,
        TotalSegments: options ? options.totalSegments : undefined,
        ExclusiveStartKey: lastEvaluatedKey
      });
      const response = await this.executeWithRetry(async () => {
        return await this.client.send(command);
      });
      if (response.Items) {
        for (const item of response.Items) {
          yield item;
        }
      }
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  }
  async query(tableName, pk, sk, options) {
    const pkAttr = options?.pkAttribute ?? "PK";
    let keyConditionExpression = `${pkAttr} = :pk`;
    const expressionAttributeValues = {
      ":pk": pk
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
      expressionAttributeValues[":sk"] = sk;
    }
    const command = new QueryCommand({
      TableName: tableName,
      IndexName: options ? options.indexName : undefined,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: options ? options.limit : undefined
    });
    const response = await this.executeWithRetry(async () => {
      return await this.client.send(command);
    });
    return response.Items || [];
  }
  async queryAll(tableName, pk, sk, options) {
    const pkAttr = options?.pkAttribute ?? "PK";
    let keyConditionExpression = `${pkAttr} = :pk`;
    const expressionAttributeValues = {
      ":pk": pk
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
      expressionAttributeValues[":sk"] = sk;
    }
    const results = [];
    let lastEvaluatedKey;
    do {
      const command = new QueryCommand({
        TableName: tableName,
        IndexName: options ? options.indexName : undefined,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExclusiveStartKey: lastEvaluatedKey
      });
      const response = await this.executeWithRetry(async () => {
        return await this.client.send(command);
      });
      if (response.Items) {
        results.push(...response.Items);
      }
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return results;
  }
  async get(tableName, pk, sk) {
    const command = new GetCommand({
      TableName: tableName,
      Key: { PK: pk, SK: sk }
    });
    const response = await this.executeWithRetry(async () => {
      return await this.client.send(command);
    });
    return response.Item ?? null;
  }
  async batchPut(tableName, records) {
    if (records.length === 0) {
      return;
    }
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
      try {
        await this.executeWithRetry(async () => {
          const response = await this.client.send(command);
          if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
            const unprocessedItems = response.UnprocessedItems[tableName];
            if (unprocessedItems) {
              const unprocessedRecords = unprocessedItems.map(item => item.PutRequest.Item);
              if (unprocessedRecords.length > 0) {
                await this.batchPut(tableName, unprocessedRecords);
              }
            }
          }
        });
      } catch (error) {
        const keys = batch.map(record => ({ PK: record.PK, SK: record.SK }));
        this.logger.error(
          `DynamoDB batchPut failed after ${this.maxRetries + 1} attempts ` +
            `against table "${tableName}" — batch of ${batch.length} records. ` +
            `Keys: ${JSON.stringify(keys)}`
        );
        throw error;
      }
    }
  }
  withTimeout(fn) {
    const ms = this.requestTimeout;
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`DynamoDB request timed out after ${ms}ms`)), ms)
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
        // Token bucket needs time to refill — enforce a minimum 10s wait.
        const backoff = isTokenBucketExhausted(error) ? Math.max(base, 10000) : base;
        const err = error;
        if (isThrottlingError(error)) {
          this.logger.debug(
            `DDB throttled — ${err.name ?? "ThrottlingError"} (attempt ${attempt + 1}/${this.maxRetries}, backoff ${backoff}ms)`
          );
        } else {
          this.logger.warn(
            `DDB retry ${attempt + 1}/${this.maxRetries}: ${err.name ?? "Error"} — ${err.message ?? String(error)} (backoff ${backoff}ms)`
          );
        }
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
    throw lastError;
  }
}
//# sourceMappingURL=DynamoDbClient.js.map
