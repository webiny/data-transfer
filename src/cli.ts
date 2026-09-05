#!/usr/bin/env node
import { register } from "tsx/esm/api";
register();

import "./utils/suppressDeprecations.ts";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createCliContainer } from "./commands/cliContainer.ts";
import { CommandRegistry } from "./commands/registry/index.ts";
import { Prompts, UI } from "./commands/prompts/index.ts";
import { openMenu } from "./commands/openMenu.ts";
import { dispatchDefault } from "./commands/dispatchDefault.ts";

process.on("unhandledRejection", (reason: unknown) => {
    const lines: string[] = ["Fatal: unhandled rejection"];
    if (reason instanceof Error) {
        lines.push(`  name:    ${reason.name}`);
        lines.push(`  message: ${reason.message}`);
        if (reason.stack) {
            lines.push(`  stack:\n${reason.stack}`);
        }
        const extra = { ...reason } as Record<string, unknown>;
        if (Object.keys(extra).length > 0) {
            lines.push(`  extra:   ${JSON.stringify(extra, null, 2)}`);
        }
    } else {
        lines.push(`  reason: ${JSON.stringify(reason, null, 2)}`);
    }
    process.stderr.write(lines.join("\n") + "\n");
    process.exit(1);
});

const container = createCliContainer();
const registry = container.resolve(CommandRegistry);
const transfer = registry.get("transfer");

let cli = yargs(hideBin(process.argv)).scriptName("transfer");

for (const command of registry.list()) {
    cli = cli.command(
        command.name,
        command.description,
        y => command.configure(y),
        async argv => {
            process.exitCode = await command.run(argv);
        }
    );
}

cli = cli.command(
    "$0 [folder]",
    false,
    y =>
        transfer.configure(y).positional("folder", {
            type: "string",
            description: "Scaffold a new project folder (same as `init <folder>`)"
        }),
    async argv => {
        process.exitCode = await dispatchDefault({
            argv,
            registry,
            openMenu: () =>
                openMenu({
                    prompts: container.resolve(Prompts),
                    ui: container.resolve(UI),
                    registry
                })
        });
    }
);

await cli.strict().help().parseAsync();
