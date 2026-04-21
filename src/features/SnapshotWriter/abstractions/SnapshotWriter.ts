import { createAbstraction } from "~/base/index.ts";

interface ISnapshotWriter {
    /**
     * Write one record as a JSONL line to the file identified by
     * `relativePath` (relative to the configured snapshot dir). Opens the
     * underlying stream lazily on first write; subsequent writes to the
     * same path append.
     */
    write(relativePath: string, record: unknown): Promise<void>;

    /** Close every open stream. Call once the run is done. */
    close(): Promise<void>;
}

export const SnapshotWriter = createAbstraction<ISnapshotWriter>("Core/SnapshotWriter");

export namespace SnapshotWriter {
    export type Interface = ISnapshotWriter;
}
