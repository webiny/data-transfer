import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import type { MigrationConfig } from "~/features/MigrationConfig/index.js";
import type { SystemConfig, SystemName } from "../types.ts";
import { type StepOutcome, ok, cancelled } from "./outcome.ts";

export interface SelectSystemInput {
    prompts: Prompts.Interface;
    config: MigrationConfig.Interface;
    systemArg?: SystemName;
}

export function formatSystemHint(system: SystemConfig): string {
    const osTable = system.opensearch ? system.opensearch.tableName : "none";
    return `ddb: ${system.dynamodb.tableName} · region: ${system.region} · os table: ${osTable}`;
}

export async function selectSystem(input: SelectSystemInput): Promise<StepOutcome<SystemName>> {
    if (input.systemArg) {
        return ok(input.systemArg);
    }
    const chosen = await input.prompts.select<SystemName>({
        message: "Which system?",
        options: [
            {
                value: "source",
                label: "source",
                hint: formatSystemHint(input.config.source)
            },
            {
                value: "target",
                label: "target",
                hint: formatSystemHint(input.config.target)
            }
        ]
    });
    if (chosen === null) {
        return cancelled();
    }
    return ok(chosen);
}
