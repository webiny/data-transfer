import { AfterTransferHook } from "./abstractions/TransferLifecycle.ts";
export type { IAfterTransferHook } from "./abstractions/TransferLifecycle.js";
declare class AfterTransferHookCompositeImpl implements AfterTransferHook.Interface {
  private readonly hooks;
  constructor(hooks: AfterTransferHook.Interface[]);
  execute(): Promise<void>;
}
export declare const AfterTransferHookComposite: typeof AfterTransferHookCompositeImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/TransferLifecycle.ts").IAfterTransferHook
  >;
};
//# sourceMappingURL=AfterTransferHookComposite.d.ts.map
