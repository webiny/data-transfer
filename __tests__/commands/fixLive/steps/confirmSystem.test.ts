import { describe, it, expect } from "vitest";
import { confirmSystem, formatSystemSummary } from "~/commands/fixLive/steps/confirmSystem.js";
import { StubPrompts } from "../../prompts/StubPrompts.ts";
import { StubUI } from "../../prompts/StubUI.ts";
import { CONFIG } from "./selectSystem.test.ts";

describe("confirmSystem", () => {
    it("summary shows endpoint only for target and account id or unknown", () => {
        const target = formatSystemSummary("target", CONFIG.target);
        expect(target).toContain("os endpoint:  https://os.example.com");
        expect(target).toContain("account id:   123456789012");
        const source = formatSystemSummary("source", CONFIG.source);
        expect(source).not.toContain("os endpoint");
        expect(source).toContain("os table:     none");
        expect(source).toContain("account id:   unknown");
    });

    it("--yes skips the confirm but still prints the note", async () => {
        const ui = new StubUI();
        const prompts = new StubPrompts();
        const result = await confirmSystem({
            prompts,
            ui,
            system: "target",
            config: CONFIG.target,
            yes: true
        });
        expect(result).toEqual({ kind: "ok", value: true });
        expect(ui.notes[0]!.title).toBe("System summary");
        expect(prompts.confirmCalls).toHaveLength(0);
    });

    it("confirm defaults to no; yes → ok, no or cancel → cancelled", async () => {
        const yes = new StubPrompts({ confirm: [true] });
        expect(
            await confirmSystem({
                prompts: yes,
                ui: new StubUI(),
                system: "target",
                config: CONFIG.target,
                yes: false
            })
        ).toEqual({ kind: "ok", value: true });
        expect(yes.confirmCalls[0]!.initialValue).toBe(false);
        expect(yes.confirmCalls[0]!.message).toBe(
            "This is the system whose records will be modified. Continue?"
        );
        const no = new StubPrompts({ confirm: [false] });
        expect(
            await confirmSystem({
                prompts: no,
                ui: new StubUI(),
                system: "target",
                config: CONFIG.target,
                yes: false
            })
        ).toEqual({ kind: "cancelled" });
        expect(
            await confirmSystem({
                prompts: new StubPrompts(),
                ui: new StubUI(),
                system: "target",
                config: CONFIG.target,
                yes: false
            })
        ).toEqual({ kind: "cancelled" });
    });
});
