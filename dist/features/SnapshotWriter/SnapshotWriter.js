import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { createGzip } from "node:zlib";
import { SnapshotWriter as SnapshotWriterAbstraction } from "./abstractions/index.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
const DEFAULT_RELATIVE_DIR = ".transfer";
const DEFAULT_SNAPSHOT_DIR_NAME = "snapshot";
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
class SnapshotWriterImpl {
  config;
  transferContext;
  dirTool;
  logger;
  streams = new Map();
  writeQueues = new Map();
  resolution;
  constructor(config, transferContext, dirTool, logger) {
    this.config = config;
    this.transferContext = transferContext;
    this.dirTool = dirTool;
    this.logger = logger;
    this.resolution = this.resolve();
    if (this.resolution.enabled) {
      this.logger.info(
        `Snapshot enabled — writing to ${this.resolution.baseDir}${this.resolution.compress ? " (gzip)" : ""}`
      );
    }
  }
  async write(relativePath, record) {
    if (!this.resolution.enabled) {
      return;
    }
    const finalPath = this.resolvePath(relativePath);
    const stream = this.ensureStream(finalPath);
    const line = `${JSON.stringify(record)}\n`;
    // Serialize writes per-path so concurrent callers from the same
    // PipelineRunner shard don't interleave half-lines into gzip.
    const previous = this.writeQueues.get(finalPath) ?? Promise.resolve();
    const next = previous.then(() => this.writeLine(stream, line, finalPath));
    this.writeQueues.set(finalPath, next);
    await next;
  }
  async close() {
    if (!this.resolution.enabled) {
      return;
    }
    const pendingWrites = Array.from(this.writeQueues.values());
    await Promise.allSettled(pendingWrites);
    const closings = [];
    for (const [, open] of this.streams) {
      closings.push(this.closeStream(open));
    }
    await Promise.allSettled(closings);
    this.streams.clear();
    this.writeQueues.clear();
  }
  resolve() {
    const raw = this.config.debug?.snapshot;
    if (!raw) {
      return { enabled: false, baseDir: "", compress: false };
    }
    const settings = raw === true ? {} : raw;
    const dirRelative =
      settings.dir ??
      join(DEFAULT_RELATIVE_DIR, this.transferContext.runId, DEFAULT_SNAPSHOT_DIR_NAME);
    const baseDir = join(process.cwd(), dirRelative);
    const compress = settings.compress ?? true;
    return { enabled: true, baseDir, compress };
  }
  resolvePath(relativePath) {
    const suffix = this.resolution.compress ? ".gz" : "";
    return join(this.resolution.baseDir, relativePath) + suffix;
  }
  ensureStream(path) {
    const existing = this.streams.get(path);
    if (existing) {
      return existing;
    }
    this.dirTool.create(dirname(path));
    const file = createWriteStream(path, { flags: "a" });
    let sink = file;
    if (this.resolution.compress) {
      const gzip = createGzip();
      gzip.pipe(file);
      sink = gzip;
    }
    const open = { sink, file };
    this.streams.set(path, open);
    return open;
  }
  async writeLine(open, line, path) {
    return new Promise(resolve => {
      open.sink.write(line, err => {
        if (err) {
          this.logger.warn(`snapshot write failed at ${path}: ${err.message}`);
        }
        resolve();
      });
    });
  }
  async closeStream(open) {
    open.sink.end();
    await once(open.file, "close");
  }
}
export const SnapshotWriter = SnapshotWriterAbstraction.createImplementation({
  implementation: SnapshotWriterImpl,
  dependencies: [MigrationConfig, TransferContext, DirectoryTool, Logger]
});
//# sourceMappingURL=SnapshotWriter.js.map
