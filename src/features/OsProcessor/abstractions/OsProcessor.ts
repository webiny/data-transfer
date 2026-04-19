import type { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";

export interface OsShardState {
    touchedIndexes: TouchedIndexes.Item[];
}
