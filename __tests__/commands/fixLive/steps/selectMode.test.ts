import { describe, it, expect } from "vitest";
import { selectMode, NO_DRY_RUN_MESSAGE } from "~/commands/fixLive/steps/selectMode.js";
import { StubPrompts } from "../../prompts/StubPrompts.ts";

const withDryRun = {
    lastDryRun: {
        runId: "1",
        at: "2026-09-04T09:12:00.000Z",
        changes: 2118,
        skips: 4
    }
};

describe("selectMode", () => {
    it("--dry-run needs no state", async () => {
        expect(
            await selectMode({
                prompts: new StubPrompts(),
                state: null,
                modeArg: "dry-run",
                yes: false
            })
        ).toEqual({ kind: "ok", value: "dry-run" });
    });

    it("--live without a dry run is refused with the shared message", async () => {
        expect(
            await selectMode({
                prompts: new StubPrompts(),
                state: null,
                modeArg: "live",
                yes: false
            })
        ).toEqual({ kind: "refused", message: NO_DRY_RUN_MESSAGE });
    });

    it("--live --yes skips the proceed confirm", async () => {
        const prompts = new StubPrompts();
        expect(
            await selectMode({
                prompts,
                state: withDryRun,
                modeArg: "live",
                yes: true
            })
        ).toEqual({ kind: "ok", value: "live" });
        expect(prompts.confirmCalls).toHaveLength(0);
    });

    it("menu disables live with a hint when there is no state", async () => {
        const prompts = new StubPrompts({ select: ["dry-run"] });
        await selectMode({ prompts, state: null, yes: false });
        const live = prompts.selectCalls[0]!.options[1]!;
        expect(live.disabled).toBe(true);
        expect(live.hint).toBe("run a dry run first");
        expect(prompts.selectCalls[0]!.initialValue).toBe("dry-run");
    });

    it("live from the menu asks to proceed with the last dry run summary", async () => {
        const prompts = new StubPrompts({ select: ["live"], confirm: [true] });
        expect(await selectMode({ prompts, state: withDryRun, yes: false })).toEqual({
            kind: "ok",
            value: "live"
        });
        expect(prompts.confirmCalls[0]!.message).toMatch(
            /^Last dry run: 2 118 changes, 2026-09-04 09:12\. Proceed\?$/
        );
        expect(prompts.confirmCalls[0]!.initialValue).toBe(false);
    });

    it("cancel or decline → cancelled", async () => {
        expect(
            await selectMode({ prompts: new StubPrompts(), state: withDryRun, yes: false })
        ).toEqual({ kind: "cancelled" });
        expect(
            await selectMode({
                prompts: new StubPrompts({ select: ["live"], confirm: [false] }),
                state: withDryRun,
                yes: false
            })
        ).toEqual({ kind: "cancelled" });
    });
});
