import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import type { UI } from "~/commands/prompts/abstractions/UI.js";
import type { SystemConfig, SystemName } from "../types.ts";
import { type StepOutcome, ok, cancelled } from "./outcome.ts";

export interface ConfirmSystemInput {
    prompts: Prompts.Interface;
    ui: UI.Interface;
    system: SystemName;
    config: SystemConfig;
    yes: boolean;
}

export function formatSystemSummary(system: SystemName, config: SystemConfig): string {
    const lines = [
        `system:       ${system}`,
        `region:       ${config.region}`,
        `ddb table:    ${config.dynamodb.tableName}`,
        `os table:     ${config.opensearch ? config.opensearch.tableName : "none"}`
    ];
    if (config.opensearch && "endpoint" in config.opensearch) {
        lines.push(`os endpoint:  ${config.opensearch.endpoint}`);
    }
    lines.push(`account id:   ${config.accountId ?? "unknown"}`);
    return lines.join("\n");
}

export async function confirmSystem(input: ConfirmSystemInput): Promise<StepOutcome<true>> {
    input.ui.note(formatSystemSummary(input.system, input.config), "System summary");
    if (input.yes) {
        return ok(true);
    }
    const answer = await input.prompts.confirm({
        message: "This is the system whose records will be modified. Continue?",
        initialValue: false
    });
    if (answer !== true) {
        return cancelled();
    }
    return ok(true);
}
