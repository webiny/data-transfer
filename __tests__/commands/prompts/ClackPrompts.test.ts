import { describe, it, expect, vi, beforeEach } from "vitest";

const CANCEL = Symbol("clack:cancel");

vi.mock("@clack/prompts", () => ({
    select: vi.fn(),
    multiselect: vi.fn(),
    confirm: vi.fn(),
    text: vi.fn(),
    isCancel: (value: unknown) => value === CANCEL
}));

import * as clack from "@clack/prompts";
import { ClackPrompts } from "~/commands/prompts/ClackPrompts.js";

const mockSelect = vi.mocked(clack.select);
const mockConfirm = vi.mocked(clack.confirm);
const mockText = vi.mocked(clack.text);

beforeEach(() => {
    vi.resetAllMocks();
});

describe("ClackPrompts", () => {
    it("select returns the chosen value", async () => {
        mockSelect.mockResolvedValue("b");
        const prompts = new ClackPrompts();
        const result = await prompts.select<string>({
            message: "Pick",
            options: [
                { value: "a", label: "A" },
                { value: "b", label: "B" }
            ]
        });
        expect(result).toBe("b");
        expect(mockSelect).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Pick", options: expect.any(Array) })
        );
    });

    it("select returns null on cancel", async () => {
        mockSelect.mockResolvedValue(CANCEL);
        const result = await new ClackPrompts().select<string>({
            message: "Pick",
            options: [{ value: "a", label: "A" }]
        });
        expect(result).toBeNull();
    });

    it("confirm returns null on cancel and the boolean otherwise", async () => {
        mockConfirm.mockResolvedValueOnce(CANCEL).mockResolvedValueOnce(false);
        const prompts = new ClackPrompts();
        expect(await prompts.confirm({ message: "Sure?" })).toBeNull();
        expect(await prompts.confirm({ message: "Sure?" })).toBe(false);
    });

    it("text passes validate through and returns null on cancel", async () => {
        mockText.mockResolvedValue(CANCEL);
        const validate = (value: string) => (value ? undefined : "required");
        expect(await new ClackPrompts().text({ message: "Name", validate })).toBeNull();
        const passed = mockText.mock.calls[0]![0];
        expect(passed.validate).toBeTypeOf("function");
    });
});
