import { createAbstraction } from "@/src/base/index.ts";

interface ITransferContext {
    runId: string;
}

export const TransferContext = createAbstraction<ITransferContext>("Transfer/TransferContext");

export namespace TransferContext {
    export type Interface = ITransferContext;
}
