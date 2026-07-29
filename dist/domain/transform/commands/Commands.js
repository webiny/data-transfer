/**
 * Collection of commands grouped by `key`. Optionally dedupes commands that
 * declare a `dedupKey` (only the first one for each key+dedupKey pair is kept).
 */
export class Commands {
  buckets = new Map();
  seen = new Map();
  claimedKeys = new Set();
  /** Add a command. Skipped if a duplicate dedupKey already exists for the same key. */
  add(command) {
    if (command.dedupKey !== undefined) {
      let seenForKey = this.seen.get(command.key);
      if (!seenForKey) {
        seenForKey = new Set();
        this.seen.set(command.key, seenForKey);
      }
      if (seenForKey.has(command.dedupKey)) {
        return;
      }
      seenForKey.add(command.dedupKey);
    }
    let bucket = this.buckets.get(command.key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(command.key, bucket);
    }
    bucket.push(command);
  }
  /** Get commands for a specific key (empty array if none) */
  get(key) {
    this.claimedKeys.add(key);
    return this.buckets.get(key) ?? [];
  }
  /** Get all commands flattened into one array */
  all() {
    const result = [];
    for (const bucket of this.buckets.values()) {
      result.push(...bucket);
    }
    return result;
  }
  /** Total number of commands across all buckets */
  size() {
    let total = 0;
    for (const bucket of this.buckets.values()) {
      total += bucket.length;
    }
    return total;
  }
  /** Available command keys */
  keys() {
    return Array.from(this.buckets.keys());
  }
  /**
   * Keys whose buckets are non-empty AND no processor claimed them via `.get()`.
   * Used by the runner to warn-once on commands a pipeline emitted but no
   * processor drained.
   */
  unclaimedKeys() {
    const result = [];
    for (const [key, bucket] of this.buckets) {
      if (bucket.length > 0 && !this.claimedKeys.has(key)) {
        result.push(key);
      }
    }
    return result;
  }
}
//# sourceMappingURL=Commands.js.map
