import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import type { FixLiveState, LiveFieldRunner } from "~/features/FixLive/index.js";
import { formatCount, formatTimestamp } from "./format.ts";
import { type StepOutcome, ok, cancelled, refused } from "./outcome.ts";

export interface SelectModeInput {
    prompts: Prompts.Interface;
    state: FixLiveState.File | null;
    modeArg?: LiveFieldRunner.Mode;
    yes: boolean;
}

export const NO_DRY_RUN_MESSAGE =
    "No completed dry run found for this project and system. Run a dry run first.";

export async function selectMode(
    input: SelectModeInput
): Promise<StepOutcome<LiveFieldRunner.Mode>> {
    const lastDryRun = input.state?.lastDryRun;

    let mode = input.modeArg;
    if (mode === "live" && !lastDryRun) {
        return refused(NO_DRY_RUN_MESSAGE);
    }

    if (!mode) {
        const chosen = await input.prompts.select<LiveFieldRunner.Mode>({
            message: "Run mode",
            initialValue: "dry-run",
            options: [
                {
                    value: "dry-run",
                    label: "dry run",
                    hint: "report only, nothing is written"
                },
                {
                    value: "live",
                    label: "live",
                    disabled: !lastDryRun,
                    hint: lastDryRun
                        ? `last dry run: ${formatCount(lastDryRun.changes)} changes, ${formatTimestamp(lastDryRun.at)}`
                        : "run a dry run first"
                }
            ]
        });
        if (chosen === null) {
            return cancelled();
        }
        mode = chosen;
    }

    if (mode === "live" && !input.yes && lastDryRun) {
        const proceed = await input.prompts.confirm({
            message: `Last dry run: ${formatCount(lastDryRun.changes)} changes, ${formatTimestamp(lastDryRun.at)}. Proceed?`,
            initialValue: false
        });
        if (proceed !== true) {
            return cancelled();
        }
    }

    return ok(mode);
}
