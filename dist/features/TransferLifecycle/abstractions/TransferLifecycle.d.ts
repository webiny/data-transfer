export interface IBeforeTransferHook {
  execute(): Promise<void>;
}
export interface IAfterTransferHook {
  execute(): Promise<void>;
}
export declare const BeforeTransferHook: import("@webiny/di").Abstraction<IBeforeTransferHook>;
export declare const AfterTransferHook: import("@webiny/di").Abstraction<IAfterTransferHook>;
export declare namespace BeforeTransferHook {
  type Interface = IBeforeTransferHook;
}
export declare namespace AfterTransferHook {
  type Interface = IAfterTransferHook;
}
//# sourceMappingURL=TransferLifecycle.d.ts.map
