import { SnapshotWriter as SnapshotWriterAbstraction } from "./abstractions/index.ts";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
export type { ISnapshotWriter } from "./abstractions/SnapshotWriter.js";
/**
 * Per-path lazy-open JSONL writer. Opens one append stream per distinct
 * `relativePath`, keeps it open until `close()`, pipes through gzip when
 * `config.debug.snapshot.compress` is on (default true). Newlines are
 * added per line; callers pass raw records.
 *
 * When `config.debug.snapshot` is falsy (the default), every `write()` +
 * `close()` call is a cheap no-op — the runner can depend on SnapshotWriter
 * unconditionally without a presence check per record.
 *
 * Failure policy: write errors are logged at `warn` but never thrown —
 * snapshot is a best-effort debugging aid, not a blocking feature.
 */
declare class SnapshotWriterImpl implements SnapshotWriterAbstraction.Interface {
  private readonly config;
  private readonly transferContext;
  private readonly dirTool;
  private readonly logger;
  private readonly streams;
  private readonly writeQueues;
  private readonly resolution;
  constructor(
    config: MigrationConfig.Interface,
    transferContext: TransferContext.Interface,
    dirTool: DirectoryTool.Interface,
    logger: Logger.Interface
  );
  write(relativePath: string, record: unknown): Promise<void>;
  close(): Promise<void>;
  private resolve;
  private resolvePath;
  private ensureStream;
  private writeLine;
  private closeStream;
}
export declare const SnapshotWriter: typeof SnapshotWriterImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/SnapshotWriter.js").ISnapshotWriter
  >;
};
//# sourceMappingURL=SnapshotWriter.d.ts.map
