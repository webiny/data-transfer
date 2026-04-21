import { createAbstraction } from "~/base/index.ts";

interface IHookRunParams {
    runId: string;
    mergeGroupId: string;
}

interface IHook {
    run(params: IHookRunParams): Promise<void>;
}

export const Hook = createAbstraction<IHook>("Core/Hook");

export namespace Hook {
    export type Interface = IHook;
    export type RunParams = IHookRunParams;
}
