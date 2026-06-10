# Pino Logger Implementation

## Overview

The project uses Pino for structured JSON logging with pretty-printing support.

## Current architecture

The logger is a DI-managed service, not a standalone utility:

- **Abstraction**: `Logger` (`src/tools/Logger/abstractions/Logger.ts`)
- **Implementation**: `PinoLogger` (`src/tools/Logger/PinoLogger.ts`)
- **Feature**: `LoggerFeature.register(container, { logLevel, json, logFile? })`

Consumers resolve via the DI container:

```ts
const logger = container.resolve(Logger);
logger.info("message");
logger.child("[segment 0]"); // per-worker prefix
```

There is no `createLogger` function — the logger is always resolved from the container.

### Log level

Configured via:

1. `config.debug.logLevel` in the user's `config.ts` (`"debug" | "info" | "warn" | "error"`, default `"info"`)
2. `--log-level` CLI flag (overrides config)

There is no `LOG_LEVEL` environment variable — log level flows through the config and CLI flag, not env vars.

### Per-worker prefixes

Each worker process creates a child logger with a segment prefix:

```ts
// src/commands/processSegment/handler.ts
const childLogger = logger.child("[segment 0]");
```

**Output example:**
```
[20:31:50.954] INFO: [segment #0] Starting segment 0 of 4 (0%)
[20:31:51.123] INFO: [segment #1] Starting segment 1 of 4 (25%)
```

### Log files

Controlled by `config.debug.logFile`:

- `true` → each process writes to `.transfer/<runId>/logs/<orchestrator|segment-N>.log` (per-process files, no interleaving)
- String → all processes append to the given path
- Absent → no log file, stdout only

### Run ID

Generated in `src/commands/run/handler.ts` (not `src/cli.ts`). Passed to all worker processes.

## Gotchas

### `pino.multistream` — always set `level` explicitly on every stream entry

When using `pino.multistream`, each stream entry is filtered **independently** by its own `level`.
If you omit `level` on an entry, pino assigns `DEFAULT_INFO_LEVEL` (30 = info) to that stream.
This means sub-info messages (debug = 20, trace = 10) are silently dropped for that stream, even
if the pino logger itself was created with a lower level.

```ts
// BUG — debug messages never reach either stream because both default to info
const logger = pino({ level: 'debug' }, pino.multistream([
    { stream: consoleStream },
    { stream: fileStream }
]));
logger.debug('this is lost');  // silently dropped
```

```ts
// CORRECT — level is propagated explicitly to every stream entry
const logger = pino({ level: 'debug' }, pino.multistream([
    { stream: consoleStream, level: 'debug' },
    { stream: fileStream, level: 'debug' }
]));
logger.debug('this appears');  // works
```

This does not affect the single-stream path (`pino(opts, stream)`) — there, pino handles all
level filtering itself and the stream receives whatever pino decides to emit.

**Rule of thumb:** whenever you add an entry to `pino.multistream`, always set `level` explicitly.
The omitted-level default of `info` is almost never what you want.

## Structured logging

Pino uses structured logging with separate fields for metadata:

```ts
// Context objects first, message string last
logger.error({ error }, "Migration failed");
logger.info({ recordsProcessed: 1000, recordsSkipped: 50 }, "Batch completed");
```
