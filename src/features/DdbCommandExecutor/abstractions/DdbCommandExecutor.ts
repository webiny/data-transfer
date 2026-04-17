import { createAbstraction } from "~/base/index.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";

interface IDdbCommandExecutor {
    /** Dispatch all commands in the collection to the target DynamoDB table and S3 bucket */
    execute(commands: Commands): Promise<void>;
}

export const DdbCommandExecutor = createAbstraction<IDdbCommandExecutor>("Core/DdbCommandExecutor");

export namespace DdbCommandExecutor {
    export type Interface = IDdbCommandExecutor;
}
