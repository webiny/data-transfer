import { describe, it, expect } from "vitest";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import type { Command } from "~/domain/transform/commands/Command.ts";
import { createDdbContainer } from "../../containers/index.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { MockS3Client } from "../../services/S3Client/MockS3Client.ts";

describe("DdbCommandExecutor", () => {
    describe("DI registration", () => {
        it("should resolve from ddb container", () => {
            const container = createDdbContainer();
            const executor = container.resolve(DdbCommandExecutor);
            expect(executor).toBeDefined();
            expect(typeof executor.execute).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(DdbCommandExecutor)).toBe(
                container.resolve(DdbCommandExecutor)
            );
        });
    });

    describe("execute", () => {
        it("should be a no-op for empty commands", async () => {
            const container = createDdbContainer();
            const executor = container.resolve(DdbCommandExecutor);
            const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
            const targetS3 = container.resolve(TargetS3Client) as MockS3Client;

            await executor.execute(new Commands());

            expect(targetDb.batchPutRecords).toHaveLength(0);
            expect(targetS3.copies).toHaveLength(0);
        });

        it("should batchPut all PUT_RECORD commands grouped by table", async () => {
            const container = createDdbContainer();
            const executor = container.resolve(DdbCommandExecutor);
            const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;

            const commands = new Commands();
            commands.add(PutRecord.create({ table: "t1", record: { PK: "a", SK: "1" } }));
            commands.add(PutRecord.create({ table: "t1", record: { PK: "b", SK: "2" } }));
            commands.add(PutRecord.create({ table: "t2", record: { PK: "c", SK: "3" } }));

            await executor.execute(commands);

            expect(targetDb.getRecordsForTable("t1")).toHaveLength(2);
            expect(targetDb.getRecordsForTable("t2")).toHaveLength(1);
        });

        it("should batchCopy all S3_COPY commands", async () => {
            const container = createDdbContainer();
            const executor = container.resolve(DdbCommandExecutor);
            const targetS3 = container.resolve(TargetS3Client) as MockS3Client;

            const commands = new Commands();
            commands.add(
                S3Copy.create({
                    sourceBucket: "src",
                    sourceKey: "k1",
                    targetBucket: "tgt",
                    targetKey: "k1"
                })
            );
            commands.add(
                S3Copy.create({
                    sourceBucket: "src",
                    sourceKey: "k2",
                    targetBucket: "tgt",
                    targetKey: "k2"
                })
            );

            await executor.execute(commands);

            expect(targetS3.copies).toHaveLength(2);
            expect(targetS3.copies[0].sourceKey).toBe("k1");
            expect(targetS3.copies[1].sourceKey).toBe("k2");
        });

        it("should run PUT and S3 commands together", async () => {
            const container = createDdbContainer();
            const executor = container.resolve(DdbCommandExecutor);
            const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
            const targetS3 = container.resolve(TargetS3Client) as MockS3Client;

            const commands = new Commands();
            commands.add(PutRecord.create({ table: "t1", record: { PK: "a", SK: "1" } }));
            commands.add(
                S3Copy.create({
                    sourceBucket: "src",
                    sourceKey: "k",
                    targetBucket: "tgt",
                    targetKey: "k"
                })
            );

            await executor.execute(commands);

            expect(targetDb.getRecordsForTable("t1")).toHaveLength(1);
            expect(targetS3.copies).toHaveLength(1);
        });

        it("should ignore unknown command keys", async () => {
            const container = createDdbContainer();
            const executor = container.resolve(DdbCommandExecutor);
            const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;

            class Unknown implements Command {
                public readonly key = "UNKNOWN_COMMAND";
            }

            const commands = new Commands();
            commands.add(new Unknown());
            commands.add(PutRecord.create({ table: "t1", record: { PK: "a", SK: "1" } }));

            await executor.execute(commands);

            // PUT still runs; unknown is ignored
            expect(targetDb.getRecordsForTable("t1")).toHaveLength(1);
        });
    });
});
