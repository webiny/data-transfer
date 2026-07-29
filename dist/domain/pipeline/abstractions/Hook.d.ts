interface IHookRunParams {
  runId: string;
  mergeGroupId: string;
}
interface IHook {
  run(params: IHookRunParams): Promise<void>;
}
export declare const Hook: import("@webiny/di").Abstraction<IHook>;
export declare namespace Hook {
  type Interface = IHook;
  type RunParams = IHookRunParams;
}
export {};
//# sourceMappingURL=Hook.d.ts.map
