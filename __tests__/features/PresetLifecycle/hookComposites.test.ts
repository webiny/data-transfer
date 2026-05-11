import { describe, it, expect, vi } from "vitest";
import { Container } from "@webiny/di";
import { BeforeLoadPresetHookComposite } from "~/features/PresetLifecycle/BeforeLoadPresetHookComposite.ts";
import { AfterLoadPresetHookComposite } from "~/features/PresetLifecycle/AfterLoadPresetHookComposite.ts";
import {
    BeforeLoadPresetHook,
    AfterLoadPresetHook
} from "~/features/PresetLifecycle/abstractions/PresetLifecycle.ts";
import type { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import type { MigrationPreset } from "~/domain/transform/Preset.ts";

const STUB_CONFIG = {} as MigrationConfig.Interface;
const STUB_PRESET = {} as MigrationPreset;

function createContainer(): Container {
    const container = new Container();
    container.registerComposite(BeforeLoadPresetHookComposite);
    container.registerComposite(AfterLoadPresetHookComposite);
    return container;
}

describe("BeforeLoadPresetHookComposite", () => {
    it("forwards config to all registered hooks", async () => {
        const container = createContainer();
        const received: MigrationConfig.Interface[] = [];
        container.registerInstance(BeforeLoadPresetHook, {
            execute: async (cfg) => { received.push(cfg); }
        });
        container.registerInstance(BeforeLoadPresetHook, {
            execute: async (cfg) => { received.push(cfg); }
        });

        await container.resolve(BeforeLoadPresetHook).execute(STUB_CONFIG);
        expect(received).toEqual([STUB_CONFIG, STUB_CONFIG]);
    });

    it("resolves without error when no hooks are registered", async () => {
        const container = createContainer();
        await expect(
            container.resolve(BeforeLoadPresetHook).execute(STUB_CONFIG)
        ).resolves.toBeUndefined();
    });
});

describe("AfterLoadPresetHookComposite", () => {
    it("forwards config and preset to all registered hooks in order", async () => {
        const container = createContainer();
        const order: string[] = [];
        const argsA: [MigrationConfig.Interface, MigrationPreset][] = [];
        const argsB: [MigrationConfig.Interface, MigrationPreset][] = [];

        container.registerInstance(AfterLoadPresetHook, {
            execute: async (cfg, preset) => { order.push("a"); argsA.push([cfg, preset]); }
        });
        container.registerInstance(AfterLoadPresetHook, {
            execute: async (cfg, preset) => { order.push("b"); argsB.push([cfg, preset]); }
        });

        await container.resolve(AfterLoadPresetHook).execute(STUB_CONFIG, STUB_PRESET);

        expect(order).toEqual(["a", "b"]);
        expect(argsA[0]).toEqual([STUB_CONFIG, STUB_PRESET]);
        expect(argsB[0]).toEqual([STUB_CONFIG, STUB_PRESET]);
    });

    it("resolves without error when no hooks are registered", async () => {
        const container = createContainer();
        await expect(
            container.resolve(AfterLoadPresetHook).execute(STUB_CONFIG, STUB_PRESET)
        ).resolves.toBeUndefined();
    });
});
