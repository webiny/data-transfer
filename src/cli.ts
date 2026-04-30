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
    const msg = reason instanceof Error ? reason.message : String(reason);
    process.stderr.write(`Fatal: unhandled rejection — ${msg}\n`);
    process.exit(1);
});

let cli = yargs(hideBin(process.argv));
cli = registerInitCommand(cli);
cli = registerRunCommand(cli);
cli = registerProcessSegmentCommand(cli);
cli.help().parse();
