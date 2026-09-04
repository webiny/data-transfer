import type { Prompts } from "./prompts/abstractions/Prompts.ts";
import type { UI } from "./prompts/abstractions/UI.ts";
import type { CommandRegistry } from "./registry/abstractions/CommandRegistry.ts";
import { EXIT_CANCELLED } from "./exitCodes.ts";

export interface OpenMenuInput {
    prompts: Prompts.Interface;
    ui: UI.Interface;
    registry: CommandRegistry.Interface;
}

export async function openMenu(input: OpenMenuInput): Promise<number> {
    const { prompts, ui, registry } = input;
    ui.intro("Webiny data transfer");
    const chosen = await prompts.select<string>({
        message: "What do you want to do?",
        options: registry.menu().map(command => ({
            value: command.name,
            label: command.name,
            hint: command.description
        }))
    });
    if (chosen === null) {
        ui.cancel("Cancelled.");
        return EXIT_CANCELLED;
    }
    return registry.get(chosen).run({});
}
