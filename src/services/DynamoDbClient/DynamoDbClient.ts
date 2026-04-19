import {
    BatchWriteCommand,
    ScanCommand,
    getDocumentClient,
    type DynamoDBDocument
} from "@webiny/aws-sdk/client-dynamodb";
// QueryCommand: @webiny/aws-sdk/client-dynamodb re-exports the LOW-LEVEL
// variant from @aws-sdk/client-dynamodb, which expects pre-marshalled
// AttributeValue inputs. Our code passes plain JS values and relies on
// DocumentClient auto-marshalling, which requires the lib-dynamodb variant.
// Imported directly here until @webiny/aws-sdk's export is fixed.
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SourceDynamoDbClient } from "./abstractions/DynamoDbClient.ts";
import { DynamoDbClientConfig } from "./abstractions/DynamoDbClientConfig.ts";
import { isRetryableAwsError } from "~/base/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

const BATCH_SIZE = 25; // AWS-enforced BatchWriteItem limit — not user-tunable
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF = 100;

export class DynamoDbClientImpl implements SourceDynamoDbClient.Interface {
    private client: DynamoDBDocument;
    private readonly maxRetries: number;
    private readonly initialBackoff: number;

    public constructor(
        config: DynamoDbClientConfig.Connection,
        tuning?: DynamoDbClientConfig.Tuning
    ) {
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
    }

    public async *scan<T extends SourceDynamoDbClient.Record = BaseRecord>(
        tableName: string,
        options?: SourceDynamoDbClient.Scan
    ): AsyncIterable<T> {
        let lastEvaluatedKey: Record<string, unknown> | undefined;

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
                    yield item as T;
                }
            }

            lastEvaluatedKey = response.LastEvaluatedKey;
        } while (lastEvaluatedKey);
    }

    public async query<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        pk: string,
        sk?: string,
        options?: SourceDynamoDbClient.Query
    ): Promise<T[]> {
        let keyConditionExpression = "PK = :pk";
        const expressionAttributeValues: Record<string, unknown> = {
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

        return (response.Items || []) as T[];
    }

    public async batchPut<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        records: T[]
    ): Promise<void> {
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

            await this.executeWithRetry(async () => {
                const response = await this.client.send(command);

                if (
                    response.UnprocessedItems &&
                    Object.keys(response.UnprocessedItems).length > 0
                ) {
                    const unprocessedItems = response.UnprocessedItems[tableName];
                    if (unprocessedItems) {
                        const unprocessedRecords = unprocessedItems.map(
                            item => item.PutRequest!.Item as T
                        );
                        if (unprocessedRecords.length > 0) {
                            await this.batchPut(tableName, unprocessedRecords);
                        }
                    }
                }
            });
        }
    }

    private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;

                if (!isRetryableAwsError(error) || attempt === this.maxRetries - 1) {
                    throw error;
                }

                const backoff = this.initialBackoff * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }

        throw lastError;
    }
}
