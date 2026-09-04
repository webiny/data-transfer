import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import { discoverProjects } from "~/commands/transfer/wizard/projectDiscovery.js";
import { type StepOutcome, ok, cancelled, refused } from "./outcome.ts";

export interface SelectProjectInput {
    prompts: Prompts.Interface;
    cwd: string;
    projectArg?: string;
}

export async function selectProject(input: SelectProjectInput): Promise<StepOutcome<string>> {
    const projects = await discoverProjects(input.cwd);

    if (input.projectArg) {
        if (!projects.includes(input.projectArg)) {
            return refused(
                `Project "${input.projectArg}" not found under projects/. Available: ${projects.join(", ") || "none"}`
            );
        }
        return ok(input.projectArg);
    }

    if (projects.length === 0) {
        return refused(
            "No projects found under projects/. Run `yarn transfer init-project <name>` first."
        );
    }

    const chosen = await input.prompts.select<string>({
        message: "Select a project",
        options: projects.map(project => ({ value: project, label: project }))
    });
    if (chosen === null) {
        return cancelled();
    }
    return ok(chosen);
}
