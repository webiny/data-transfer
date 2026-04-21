import { createWriteStream } from "node:fs";
import type { WriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { createGzip, type Gzip } from "node:zlib";
import { SnapshotWriter } from "./abstractions/SnapshotWriter.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";

interface OpenStream {
    /** The stream the writer actually .write()s to — gzip OR the raw file. */
    sink: Gzip | WriteStream;
    /** The underlying file stream — always; used to await close events. */
    file: WriteStream;
}

interface Resolution {
    enabled: boolean;
    baseDir: string;
    compress: boolean;
}

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
class JsonlSnapshotWriterImpl implements SnapshotWriter.Interface {
    private readonly streams: Map<string, OpenStream> = new Map();
    private readonly writeQueues: Map<string, Promise<void>> = new Map();
    private readonly resolution: Resolution;

    public constructor(
        private readonly config: MigrationConfig.Interface,
        private readonly transferContext: TransferContext.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly logger: Logger.Interface
    ) {
        this.resolution = this.resolve();
        if (this.resolution.enabled) {
            this.logger.info(
                `Snapshot enabled — writing to ${this.resolution.baseDir}${this.resolution.compress ? " (gzip)" : ""}`
            );
        }
    }

    public async write(relativePath: string, record: unknown): Promise<void> {
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

    public async close(): Promise<void> {
        if (!this.resolution.enabled) {
            return;
        }
        const pendingWrites = Array.from(this.writeQueues.values());
        await Promise.allSettled(pendingWrites);

        const closings: Promise<void>[] = [];
        for (const [, open] of this.streams) {
            closings.push(this.closeStream(open));
        }
        await Promise.allSettled(closings);
        this.streams.clear();
        this.writeQueues.clear();
    }

    private resolve(): Resolution {
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

    private resolvePath(relativePath: string): string {
        const suffix = this.resolution.compress ? ".gz" : "";
        return join(this.resolution.baseDir, relativePath) + suffix;
    }

    private ensureStream(path: string): OpenStream {
        const existing = this.streams.get(path);
        if (existing) {
            return existing;
        }
        this.dirTool.create(dirname(path));
        const file = createWriteStream(path, { flags: "a" });
        let sink: Gzip | WriteStream = file;
        if (this.resolution.compress) {
            const gzip = createGzip();
            gzip.pipe(file);
            sink = gzip;
        }
        const open: OpenStream = { sink, file };
        this.streams.set(path, open);
        return open;
    }

    private async writeLine(open: OpenStream, line: string, path: string): Promise<void> {
        return new Promise<void>(resolve => {
            open.sink.write(line, err => {
                if (err) {
                    this.logger.warn(`snapshot write failed at ${path}: ${err.message}`);
                }
                resolve();
            });
        });
    }

    private async closeStream(open: OpenStream): Promise<void> {
        open.sink.end();
        await once(open.file, "close");
    }
}

export const JsonlSnapshotWriter = SnapshotWriter.createImplementation({
    implementation: JsonlSnapshotWriterImpl,
    dependencies: [MigrationConfig, TransferContext, DirectoryTool, Logger]
});
