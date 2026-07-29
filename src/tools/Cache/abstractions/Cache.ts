import { createAbstraction } from "~/base/index.js";

interface ICache {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    size(): number;
}

// ============================================================================
// Abstraction
// ============================================================================

export const Cache = createAbstraction<ICache>("Core/Cache");

export namespace Cache {
    export type Interface = ICache;
}
