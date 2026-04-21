/**
 * Base contract for all transformation commands.
 *
 * Commands are emitted by transformers via the TransformContext and collected
 * in a Commands collection. The executor processes them grouped by `key`.
 */
export interface Command {
    /** Stable identifier for the command type — used for grouping and routing */
    readonly key: string;
    /**
     * Optional dedup identity. If two commands with the same `key` and same
     * `dedupKey` are added, only the first one is kept.
     */
    readonly dedupKey?: string;
}
