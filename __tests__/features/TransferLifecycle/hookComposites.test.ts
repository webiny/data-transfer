import { describe, it, expect, vi } from "vitest";
import { Container } from "@webiny/di";
import { TransferLifecycleFeature } from "~/features/TransferLifecycle/feature.ts";
import {
    BeforeTransferHook,
    AfterTransferHook
} from "~/features/TransferLifecycle/abstractions/TransferLifecycle.ts";

function createContainer(): Container {
    const container = new Container();
    TransferLifecycleFeature.register(container);
    return container;
}

describe("BeforeTransferHookComposite", () => {
    it("calls all registered hooks", async () => {
        const container = createContainer();
        const calls: number[] = [];
        container.registerInstance(BeforeTransferHook, { execute: async () => { calls.push(1); } });
        container.registerInstance(BeforeTransferHook, { execute: async () => { calls.push(2); } });

        await container.resolve(BeforeTransferHook).execute();
        expect(calls).toEqual([1, 2]);
    });

    it("calls hooks in registration order", async () => {
        const container = createContainer();
        const order: string[] = [];
        container.registerInstance(BeforeTransferHook, { execute: async () => { order.push("first"); } });
        container.registerInstance(BeforeTransferHook, { execute: async () => { order.push("second"); } });
        container.registerInstance(BeforeTransferHook, { execute: async () => { order.push("third"); } });

        await container.resolve(BeforeTransferHook).execute();
        expect(order).toEqual(["first", "second", "third"]);
    });

    it("resolves without error when no hooks are registered", async () => {
        const container = createContainer();
        await expect(container.resolve(BeforeTransferHook).execute()).resolves.toBeUndefined();
    });
});

describe("AfterTransferHookComposite", () => {
    it("calls all registered hooks", async () => {
        const container = createContainer();
        const fn1 = vi.fn();
        const fn2 = vi.fn();
        container.registerInstance(AfterTransferHook, { execute: fn1 });
        container.registerInstance(AfterTransferHook, { execute: fn2 });

        await container.resolve(AfterTransferHook).execute();
        expect(fn1).toHaveBeenCalledOnce();
        expect(fn2).toHaveBeenCalledOnce();
    });

    it("resolves without error when no hooks are registered", async () => {
        const container = createContainer();
        await expect(container.resolve(AfterTransferHook).execute()).resolves.toBeUndefined();
    });
});
