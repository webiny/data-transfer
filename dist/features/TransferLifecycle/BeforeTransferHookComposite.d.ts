import { BeforeTransferHook } from "./abstractions/TransferLifecycle.ts";
export type { IBeforeTransferHook } from "./abstractions/TransferLifecycle.js";
declare class BeforeTransferHookCompositeImpl implements BeforeTransferHook.Interface {
  private readonly hooks;
  constructor(hooks: BeforeTransferHook.Interface[]);
  execute(): Promise<void>;
}
export declare const BeforeTransferHookComposite: typeof BeforeTransferHookCompositeImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/TransferLifecycle.ts").IBeforeTransferHook
  >;
};
//# sourceMappingURL=BeforeTransferHookComposite.d.ts.map
