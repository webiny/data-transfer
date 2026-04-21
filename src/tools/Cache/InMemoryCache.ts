import { Cache as CacheAbstraction } from "./abstractions/Cache.ts";

class InMemoryCacheImpl implements CacheAbstraction.Interface {
    private store: Map<string, unknown> = new Map();

    public get<T>(key: string): T | undefined {
        return this.store.get(key) as T | undefined;
    }

    public set<T>(key: string, value: T): void {
        this.store.set(key, value);
    }

    public has(key: string): boolean {
        return this.store.has(key);
    }

    public delete(key: string): boolean {
        return this.store.delete(key);
    }

    public clear(): void {
        this.store.clear();
    }

    public size(): number {
        return this.store.size;
    }
}

export const InMemoryCache = CacheAbstraction.createImplementation({
    implementation: InMemoryCacheImpl,
    dependencies: []
});
