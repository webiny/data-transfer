import { createAbstraction } from "~/base/index.js";

interface ITransferContext {
    runId: string;
    dryRun?: boolean;
}

export const TransferContext = createAbstraction<ITransferContext>("Transfer/TransferContext");

export namespace TransferContext {
    export type Interface = ITransferContext;
}
