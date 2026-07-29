import type { Command } from "./Command.ts";
/**
 * Collection of commands grouped by `key`. Optionally dedupes commands that
 * declare a `dedupKey` (only the first one for each key+dedupKey pair is kept).
 */
export declare class Commands {
  private buckets;
  private seen;
  private claimedKeys;
  /** Add a command. Skipped if a duplicate dedupKey already exists for the same key. */
  add(command: Command): void;
  /** Get commands for a specific key (empty array if none) */
  get<TCommand extends Command = Command>(key: string): TCommand[];
  /** Get all commands flattened into one array */
  all(): Command[];
  /** Total number of commands across all buckets */
  size(): number;
  /** Available command keys */
  keys(): string[];
  /**
   * Keys whose buckets are non-empty AND no processor claimed them via `.get()`.
   * Used by the runner to warn-once on commands a pipeline emitted but no
   * processor drained.
   */
  unclaimedKeys(): string[];
}
//# sourceMappingURL=Commands.d.ts.map
