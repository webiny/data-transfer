# Pino Logger Implementation

## Overview

Replaced the simple console-based logger with Pino, a fast and structured JSON logger with pretty printing support.

## Changes Made

### 1. Dependencies Added

```bash
yarn add pino pino-pretty
```

### 2. Logger Utility (`src/utils/logger.ts`)

**New API**:
```typescript
import { createLogger, Logger } from "./utils/logger.ts";

// Create logger with optional configuration
const logger = createLogger({
  level: "info",           // Optional: trace, debug, info, warn, error
  msgPrefix: "[segment #0] " // Optional: prefix for all messages
});

// Usage
logger.info("Simple message");
logger.info("Message with data", { key: "value" });
logger.warn({ error }, "Warning message");
logger.error({ error }, "Error message");
```

**Environment Variable**:
- `LOG_LEVEL`: Set log level (trace, debug, info, warn, error)
- Default: `info`

### 3. Run ID Generation (`src/cli.ts`)

Each migration run now gets a unique ID:
```typescript
const runId = String(Date.now());
logger.info(`Run ID: ${runId}`);
```

The runId is:
- Generated once in the main process
- Passed to all worker processes
- Can be used for log file naming and correlation

### 4. Segment Prefixes (`src/process-segment.ts`)

Each worker process logs with a segment prefix:
```typescript
const logger = createLogger({
  msgPrefix: `[segment #${options.segment}] `
});
```

**Output Example**:
```
[20:31:50.954] INFO: [segment #0] Starting segment 0 of 4 (0%)
[20:31:51.123] INFO: [segment #1] Starting segment 1 of 4 (25%)
[20:31:51.245] INFO: [segment #2] Starting segment 2 of 4 (50%)
[20:31:51.367] INFO: [segment #3] Starting segment 3 of 4 (75%)
```

### 5. Structured Logging

Pino uses structured logging with separate fields for metadata:

**Before** (console-based):
```typescript
logger.error("Migration failed:", error);
```

**After** (Pino):
```typescript
logger.error({ error }, "Migration failed");
```

This allows:
- Better log parsing and filtering
- Easier debugging with structured data
- JSON output for log aggregation systems

## Benefits

1. **Performance**: Pino is one of the fastest Node.js loggers
2. **Structured**: JSON-based logging for easy parsing
3. **Pretty Printing**: Human-readable output during development
4. **Prefixes**: Easy identification of which segment is logging
5. **Run Correlation**: Run ID allows tracking all logs from a single migration run
6. **Log Levels**: Configurable verbosity via environment variable

## Usage Examples

### Basic Logging
```typescript
logger.info("Processing records");
logger.warn("Found duplicate record");
logger.error({ recordId: "123" }, "Failed to process record");
```

### With Context
```typescript
logger.info({
  recordsProcessed: 1000,
  recordsMigrated: 950,
  recordsSkipped: 50
}, "Batch completed");
```

### With Errors
```typescript
try {
  await processRecord(record);
} catch (error) {
  logger.error({ error, recordId: record.id }, "Failed to process record");
}
```

## Configuration

### Log Levels
Set via environment variable:
```bash
LOG_LEVEL=trace yarn dev ...
LOG_LEVEL=debug yarn dev ...
LOG_LEVEL=info yarn dev ...   # Default
LOG_LEVEL=warn yarn dev ...
LOG_LEVEL=error yarn dev ...
```

### Pretty Printing
The logger is configured with:
- Colorized output
- Hidden `pid` and `hostname` fields
- Human-readable timestamps (`HH:MM:ss.l`)

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

## Future Enhancements

Based on the DDB-ES migration reference, these features can be added:

1. **Log Files**: Write logs to temporary directory
   ```typescript
   const logFilePath = path.join(
     os.tmpdir(),
     `v5-to-v6-migration-log-${runId}-${segment}.log`
   );
   ```

2. **Statistics Tracking**: Write stats to JSON files per segment
3. **Log Aggregation**: Collect all segment logs at the end
4. **Metrics**: Track and report migration statistics
