import { describe, it, expect, vi } from "vitest";
import type { Command } from "~/commands/registry/abstractions/Command.js";
import type { CommandRegistry } from "~/commands/registry/abstractions/CommandRegistry.js";
import { openMenu } from "~/commands/openMenu.js";
import { StubPrompts } from "./prompts/StubPrompts.ts";
import { StubUI } from "./prompts/StubUI.ts";

const command = (name: string, run: Command.Interface["run"], hidden?: boolean) =>
    ({
        name,
        description: `${name} desc`,
        hidden,
        configure: y => y,
        run
    }) as Command.Interface;

function registry(commands: Command.Interface[]): CommandRegistry.Interface {
    return {
        list: () => commands,
        menu: () => commands.filter(c => c.hidden !== true),
        get: (name: string) => commands.find(c => c.name === name)!
    };
}

describe("openMenu", () => {
    it("offers only non-hidden commands with descriptions as hints", async () => {
        const prompts = new StubPrompts({ select: ["transfer"] });
        const transfer = vi.fn(async () => 0);
        await openMenu({
            prompts,
            ui: new StubUI(),
            registry: registry([
                command("transfer", transfer),
                command("fix-live", vi.fn()),
                command("process-segment", vi.fn(), true)
            ])
        });
        expect(prompts.selectCalls[0]!.options).toEqual([
            { value: "transfer", label: "transfer", hint: "transfer desc" },
            { value: "fix-live", label: "fix-live", hint: "fix-live desc" }
        ]);
        expect(transfer).toHaveBeenCalledWith({});
    });

    it("returns the chosen command's exit code", async () => {
        const code = await openMenu({
            prompts: new StubPrompts({ select: ["fix-live"] }),
            ui: new StubUI(),
            registry: registry([command("transfer", vi.fn()), command("fix-live", async () => 1)])
        });
        expect(code).toBe(1);
    });

    it("exits 130 on cancel", async () => {
        const ui = new StubUI();
        const code = await openMenu({
            prompts: new StubPrompts(),
            ui,
            registry: registry([command("transfer", vi.fn())])
        });
        expect(code).toBe(130);
        expect(ui.cancels).toEqual(["Cancelled."]);
    });
});
