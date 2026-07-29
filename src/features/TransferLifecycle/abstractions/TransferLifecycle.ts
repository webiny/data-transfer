import { createAbstraction } from "~/base/index.js";

export interface IBeforeTransferHook {
    execute(): Promise<void>;
}

export interface IAfterTransferHook {
    execute(): Promise<void>;
}

// ============================================================================
// Abstractions
// ============================================================================

export const BeforeTransferHook = createAbstraction<IBeforeTransferHook>(
    "Transfer/BeforeTransferHook"
);

export const AfterTransferHook = createAbstraction<IAfterTransferHook>(
    "Transfer/AfterTransferHook"
);

export namespace BeforeTransferHook {
    export type Interface = IBeforeTransferHook;
}

export namespace AfterTransferHook {
    export type Interface = IAfterTransferHook;
}
