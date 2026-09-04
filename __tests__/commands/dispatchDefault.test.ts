import { describe, it, expect, vi } from "vitest";
import type { Command } from "~/commands/registry/abstractions/Command.js";
import type { CommandRegistry } from "~/commands/registry/abstractions/CommandRegistry.js";
import { dispatchDefault } from "~/commands/dispatchDefault.js";

function fakeRegistry(runs: Record<string, ReturnType<typeof vi.fn>>): CommandRegistry.Interface {
    const commands = Object.entries(runs).map(
        ([name, run]) => ({ name, description: name, configure: y => y, run }) as Command.Interface
    );
    return {
        list: () => commands,
        menu: () => commands,
        get: (name: string) => commands.find(c => c.name === name)!
    };
}

describe("dispatchDefault", () => {
    it("`yarn transfer <folder>` runs init with the folder as project-name", async () => {
        const init = vi.fn(async () => 0);
        const openMenu = vi.fn(async () => 130);
        const code = await dispatchDefault({
            argv: { folder: "my-folder" },
            registry: fakeRegistry({ init, transfer: vi.fn() }),
            openMenu
        });
        expect(code).toBe(0);
        expect(init).toHaveBeenCalledWith({
            folder: "my-folder",
            "project-name": "my-folder"
        });
        expect(openMenu).not.toHaveBeenCalled();
    });

    it("`yarn transfer --config --preset` runs the transfer command", async () => {
        const transfer = vi.fn(async () => 0);
        const argv = { config: "./c.ts", preset: "copy-ddb" };
        const code = await dispatchDefault({
            argv,
            registry: fakeRegistry({ init: vi.fn(), transfer }),
            openMenu: vi.fn(async () => 130)
        });
        expect(code).toBe(0);
        expect(transfer).toHaveBeenCalledWith(argv);
    });

    it("`--config` alone still routes to transfer (wizard prompts for the rest)", async () => {
        const transfer = vi.fn(async () => 0);
        await dispatchDefault({
            argv: { config: "./c.ts" },
            registry: fakeRegistry({ init: vi.fn(), transfer }),
            openMenu: vi.fn(async () => 130)
        });
        expect(transfer).toHaveBeenCalledOnce();
    });

    it("no arguments opens the menu and returns its exit code", async () => {
        const openMenu = vi.fn(async () => 130);
        const code = await dispatchDefault({
            argv: {},
            registry: fakeRegistry({ init: vi.fn(), transfer: vi.fn() }),
            openMenu
        });
        expect(code).toBe(130);
        expect(openMenu).toHaveBeenCalledOnce();
    });
});
