#!/usr/bin/env node
// Install the deprecation filter FIRST so it's in place before any
// import pulls in @webiny/lexical-* (the DEP0151 source). ESM imports
// are evaluated in order within a module; this one must stay on top.
import "./utils/suppressDeprecations.ts";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
    registerRunCommand,
    registerInitCommand,
    registerProcessSegmentCommand
} from "./commands/index.ts";

// Last-resort safety net: any promise rejection that escapes all try-catch
// blocks (e.g. from SDK internals during a backoff sleep) is caught here so
// the process always exits with code 1 rather than crashing silently.
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

let cli = yargs(hideBin(process.argv));
cli = registerInitCommand(cli);
cli = registerRunCommand(cli);
cli = registerProcessSegmentCommand(cli);
cli.help().parse();
