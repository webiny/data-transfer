import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { BeforeTransferHook } from "../../features/TransferLifecycle/index.js";
export type { IBeforeTransferHook } from "../../features/TransferLifecycle/abstractions/TransferLifecycle.js";
declare class OsIndexPrefixHookImpl implements BeforeTransferHook.Interface {
  private readonly config;
  constructor(config: MigrationConfig.Interface);
  execute(): Promise<void>;
}
export declare const OsIndexPrefixHook: typeof OsIndexPrefixHookImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("../../features/TransferLifecycle/abstractions/TransferLifecycle.js").IBeforeTransferHook
  >;
};
//# sourceMappingURL=OsIndexPrefixHook.d.ts.map
