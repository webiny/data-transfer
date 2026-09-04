import { describe, it, expect } from "vitest";
import { StubPrompts } from "./StubPrompts.ts";
import { StubUI, StubCancelError } from "./StubUI.ts";

describe("StubPrompts", () => {
    it("answers in order and cancels when exhausted", async () => {
        const prompts = new StubPrompts({ select: ["a"], confirm: [true] });
        expect(await prompts.select({ message: "m", options: [] })).toBe("a");
        expect(await prompts.select({ message: "m", options: [] })).toBeNull();
        expect(await prompts.confirm({ message: "c" })).toBe(true);
        expect(await prompts.confirm({ message: "c" })).toBeNull();
        expect(prompts.selectCalls).toHaveLength(2);
    });
});

describe("StubUI", () => {
    it("exitOnCancel throws on null and passes values through", () => {
        const ui = new StubUI();
        expect(ui.exitOnCancel("x")).toBe("x");
        expect(() => ui.exitOnCancel(null)).toThrow(StubCancelError);
        expect(ui.cancels).toEqual(["Cancelled."]);
    });
});
