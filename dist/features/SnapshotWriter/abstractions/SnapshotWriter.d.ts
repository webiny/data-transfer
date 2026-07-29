export interface ISnapshotWriter {
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
export declare const SnapshotWriter: import("@webiny/di").Abstraction<ISnapshotWriter>;
export declare namespace SnapshotWriter {
  type Interface = ISnapshotWriter;
}
//# sourceMappingURL=SnapshotWriter.d.ts.map
