import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { Container } from "@webiny/di";
import { Cache, CacheFeature } from "../../../src/features/Cache/index.ts";

describe("Cache", () => {
    describe("InMemoryCache", () => {
        let cache: Cache.Interface;

        beforeEach(() => {
            const container = new Container();
            CacheFeature.register(container);
            cache = container.resolve(Cache);
        });

        it("should set and get a value", () => {
            cache.set("key", "value");
            expect(cache.get("key")).toBe("value");
        });

        it("should return undefined for missing key", () => {
            expect(cache.get("missing")).toBeUndefined();
        });

        it("should check if key exists", () => {
            cache.set("key", "value");
            expect(cache.has("key")).toBe(true);
            expect(cache.has("missing")).toBe(false);
        });

        it("should delete a key", () => {
            cache.set("key", "value");
            expect(cache.delete("key")).toBe(true);
            expect(cache.has("key")).toBe(false);
            expect(cache.delete("missing")).toBe(false);
        });

        it("should clear all entries", () => {
            cache.set("a", 1);
            cache.set("b", 2);
            cache.clear();
            expect(cache.size()).toBe(0);
        });

        it("should return size", () => {
            expect(cache.size()).toBe(0);
            cache.set("a", 1);
            cache.set("b", 2);
            expect(cache.size()).toBe(2);
        });

        it("should overwrite existing key", () => {
            cache.set("key", "first");
            cache.set("key", "second");
            expect(cache.get("key")).toBe("second");
            expect(cache.size()).toBe(1);
        });

        it("should support typed get", () => {
            cache.set("count", 42);
            const value = cache.get<number>("count");
            expect(value).toBe(42);
        });

        it("should support complex values", () => {
            const data = { indexes: new Set(["a", "b"]), count: 5 };
            cache.set("complex", data);
            const retrieved = cache.get<typeof data>("complex");
            expect(retrieved).toBe(data);
        });
    });

    describe("DI registration", () => {
        it("should resolve cache as singleton from container", () => {
            const container = new Container();
            CacheFeature.register(container);

            const first = container.resolve(Cache);
            const second = container.resolve(Cache);

            expect(first).toBe(second);
        });

        it("should share state across resolves", () => {
            const container = new Container();
            CacheFeature.register(container);

            const cache1 = container.resolve(Cache);
            cache1.set("shared", "data");

            const cache2 = container.resolve(Cache);
            expect(cache2.get("shared")).toBe("data");
        });
    });
});
