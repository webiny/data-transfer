import type { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { TargetDynamoDbClient } from "~/features/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { TargetS3Client } from "~/features/S3Client/abstractions/S3Client.ts";
import { Logger } from "~/features/Logger/abstractions/Logger.ts";
import { DdbCommandExecutor as DdbCommandExecutorAbstraction } from "./abstractions/DdbCommandExecutor.ts";

const KNOWN_KEYS = new Set<string>([PutRecord.key, S3Copy.key]);

class DdbCommandExecutorImpl implements DdbCommandExecutorAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly targetDb: TargetDynamoDbClient.Interface,
        private readonly targetS3: TargetS3Client.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        if (commands.size() === 0) {
            this.logger.info("No commands to execute");
            return;
        }

        this.warnOnUnknownCommands(commands);

        await Promise.all([this.executePuts(commands), this.executeCopies(commands)]);
    }

    private warnOnUnknownCommands(commands: Commands): void {
        for (const key of commands.keys()) {
            if (!KNOWN_KEYS.has(key)) {
                this.logger.warn(
                    `DdbCommandExecutor does not handle commands with key "${key}" — ignored`
                );
            }
        }
    }

    private async executePuts(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        if (puts.length === 0) {
            return;
        }

        const byTable = new Map<string, Record<string, unknown>[]>();
        for (const cmd of puts) {
            let bucket = byTable.get(cmd.table);
            if (!bucket) {
                bucket = [];
                byTable.set(cmd.table, bucket);
            }
            bucket.push(cmd.record);
        }

        await Promise.all(
            Array.from(byTable.entries()).map(([table, records]) =>
                this.targetDb.batchPut(table, records as any)
            )
        );
    }

    private async executeCopies(commands: Commands): Promise<void> {
        const copies = commands.get<S3Copy>(S3Copy.key);
        if (copies.length === 0) {
            return;
        }

        await this.targetS3.batchCopy(
            copies.map(cmd => ({
                sourceBucket: cmd.sourceBucket,
                sourceKey: cmd.sourceKey,
                targetBucket: cmd.targetBucket,
                targetKey: cmd.targetKey
            }))
        );
    }
}

export const DdbCommandExecutor = DdbCommandExecutorAbstraction.createImplementation({
    implementation: DdbCommandExecutorImpl,
    dependencies: [Logger, TargetDynamoDbClient, TargetS3Client]
});
