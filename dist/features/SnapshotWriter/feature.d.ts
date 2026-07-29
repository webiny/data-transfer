/**
 * Registers the SnapshotWriter abstraction. The single impl handles
 * both enabled and disabled modes — when `config.debug.snapshot` is
 * falsy, write() and close() are cheap no-ops.
 */
export declare const SnapshotWriterFeature: {
  name: string;
  register(container: import("@webiny/di").Container): void;
};
//# sourceMappingURL=feature.d.ts.map
