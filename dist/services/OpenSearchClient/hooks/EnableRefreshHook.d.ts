import { AfterTransferHook } from "../../../features/TransferLifecycle/abstractions/TransferLifecycle.js";
import { TransferContext } from "../../../features/TransferLifecycle/abstractions/TransferContext.js";
import { OpenSearchClient } from "../abstractions/OpenSearchClient.ts";
import { Logger } from "../../../tools/Logger/abstractions/Logger.js";
import { DirectoryTool } from "../../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../../tools/FileTool/abstractions/FileTool.js";
export type { IAfterTransferHook } from "../../../features/TransferLifecycle/abstractions/TransferLifecycle.js";
declare class EnableRefreshHookImpl implements AfterTransferHook.Interface {
  private readonly osClient;
  private readonly logger;
  private readonly transferContext;
  private readonly dirTool;
  private readonly fileTool;
  constructor(
    osClient: OpenSearchClient.Interface,
    logger: Logger.Interface,
    transferContext: TransferContext.Interface,
    dirTool: DirectoryTool.Interface,
    fileTool: FileTool.Interface
  );
  execute(): Promise<void>;
  private loadTouchedIndexes;
}
export declare const EnableRefreshHook: typeof EnableRefreshHookImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("../../../features/TransferLifecycle/abstractions/TransferLifecycle.js").IAfterTransferHook
  >;
};
//# sourceMappingURL=EnableRefreshHook.d.ts.map
