import { createAbstraction } from "~/base/index.ts";
import type { S3Copy } from "~/domain/transform/commands/S3Copy.ts";

interface IS3CopyExecutor {
    /** Copy S3 objects in a batch. No-op on empty input. */
    execute(copies: S3Copy[]): Promise<void>;
}

export const S3CopyExecutor = createAbstraction<IS3CopyExecutor>("Core/S3CopyExecutor");

export namespace S3CopyExecutor {
    export type Interface = IS3CopyExecutor;
}
