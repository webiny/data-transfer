import type { Command } from "./Command.ts";

/**
 * Collection of commands grouped by `key`. Optionally dedupes commands that
 * declare a `dedupKey` (only the first one for each key+dedupKey pair is kept).
 */
export class Commands {
    private buckets: Map<string, Command[]> = new Map();
    private seen: Map<string, Set<string>> = new Map();

    /** Add a command. Skipped if a duplicate dedupKey already exists for the same key. */
    public add(command: Command): void {
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
    public get<TCommand extends Command = Command>(key: string): TCommand[] {
        return (this.buckets.get(key) ?? []) as TCommand[];
    }

    /** Get all commands flattened into one array */
    public all(): Command[] {
        const result: Command[] = [];
        for (const bucket of this.buckets.values()) {
            result.push(...bucket);
        }
        return result;
    }

    /** Total number of commands across all buckets */
    public size(): number {
        let total = 0;
        for (const bucket of this.buckets.values()) {
            total += bucket.length;
        }
        return total;
    }

    /** Available command keys */
    public keys(): string[] {
        return Array.from(this.buckets.keys());
    }
}
