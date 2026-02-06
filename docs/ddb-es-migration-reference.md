# DDB-ES Migration Pattern Reference

Reference documentation for DynamoDB + Elasticsearch migration patterns from `.sample/migration/ddb-es`.

## Architecture Overview

**Pattern**: Main process spawns multiple worker processes (one per segment) for parallel DynamoDB scanning.

```
Main Process (MetaFieldsMigration)
├── Pre-migration: ES health checks & disable indexing
├── Spawn N workers (SegmentProcessor)
│   └── Each worker processes 1/N of DynamoDB table
├── Post-migration: Restore ES settings
└── Aggregate stats from all workers
```

## 1. Logging to Temporary Directory

### Location
- **Directory**: `os.tmpdir()` (system temp directory)
- **File naming**: Includes run ID and segment index for uniqueness

### Implementation Pattern

**Main Process Log** (`MetaFieldsMigration.ts:235-242`):
```typescript
const logFilePath = path.join(
    os.tmpdir(),
    `webiny-5-39-6-meta-fields-data-migration-log-${this.runId}.log`
);

fs.writeFileSync(logFilePath, JSON.stringify(migrationStats, null, 2));
```

**Worker Process Logs** (`worker.ts:571-578`):
```typescript
const logFilePath = path.join(
    os.tmpdir(),
    `webiny-5-39-6-meta-fields-data-migration-log-${argv.runId}-${argv.segmentIndex}.log`
);

// Save stats to file (both on success and error)
fs.writeFileSync(logFilePath, JSON.stringify(status.stats, null, 2));
```

### Key Features
- **Unique Run ID**: Generated once in main process, passed to all workers
  ```typescript
  this.runId = String(new Date().getTime());
  ```
- **Per-segment logs**: Each worker writes its own stats file
- **Log aggregation**: Main process collects all worker logs using glob:
  ```typescript
  const logFilePaths = await glob(
      path.join(os.tmpdir(), `webiny-5-39-6-meta-fields-data-migration-log-${this.runId}-*.log`)
  );
  ```
- **Error resilience**: Logs written in both success and error paths

## 2. Elasticsearch Health Status Checks

### Health Check Parameters

**Configurable Thresholds** (`utils.ts:7-15`):
```typescript
export const DEFAULT_ES_HEALTH_CHECKS_PARAMS: EsHealthChecksParams = {
    minClusterHealthStatus: ElasticsearchCatClusterHealthStatus.Yellow,
    maxProcessorPercent: 90,
    maxRamPercent: 100,
    maxWaitingTime: 90,        // seconds
    waitingTimeStep: 2          // seconds between checks
};
```

### CLI Options (`bin.ts:20-48`)
All ES health check params are exposed as CLI flags:
- `--esHealthMinClusterHealthStatus`: Cluster status (yellow/green)
- `--esHealthMaxProcessorPercent`: Max CPU usage %
- `--esHealthMaxRamPercent`: Max RAM usage %
- `--esHealthMaxWaitingTime`: Max wait time before proceeding (seconds)
- `--esHealthWaitingTimeStep`: Interval between health checks (seconds)

### Health Check Flow

**1. Pre-Migration Check** (`MetaFieldsMigration.ts:102-106`):
```typescript
this.logger.info("Checking Elasticsearch health status...");
const waitUntilHealthy = createWaitUntilHealthy(elasticsearchClient, this.esHealthChecks);
await waitUntilHealthy.wait();
this.logger.info("Elasticsearch is healthy.");
```

**2. Before Each Batch Write** (`worker.ts:472-498`):
```typescript
const results = await waitUntilHealthy.wait({
    async onUnhealthy(params) {
        const shouldWaitReason = params.waitingReason.name;

        logger.warn(
            `Cluster is unhealthy (${shouldWaitReason}). Waiting for cluster to become healthy...`,
            params
        );

        // Track unhealthy reasons in stats
        if (status.stats.esHealthChecks.unhealthyReasons[shouldWaitReason]) {
            status.stats.esHealthChecks.unhealthyReasons[shouldWaitReason]++;
        } else {
            status.stats.esHealthChecks.unhealthyReasons[shouldWaitReason] = 1;
        }
    }
});

// Track health check metrics
status.stats.esHealthChecks.checksCount++;
status.stats.esHealthChecks.timeSpentWaiting += results.runningTime;
```

### Disable/Restore ES Indexing

**Pre-Migration**: Disable refresh interval for faster bulk writes
```typescript
const indexSettings: Record<string, any> = {};
for (const indexName of indexes) {
    // Save original settings
    indexSettings[indexName] = await fetchOriginalElasticsearchSettings({
        elasticsearchClient,
        index: indexName,
        logger: this.logger
    });

    // Disable indexing (sets refresh_interval to -1)
    await disableElasticsearchIndexing({
        elasticsearchClient,
        index: indexName,
        logger: this.logger
    });
}
```

**Post-Migration**: Restore original settings
```typescript
await restoreOriginalElasticsearchSettings({
    elasticsearchClient,
    indexSettings,
    logger: this.logger
});
```

## 3. Output Statistics

### Stats Structure (`worker.ts:66-81`)

```typescript
interface MigrationStatus {
    lastEvaluatedKey: LastEvaluatedKey;
    stats: {
        iterationsCount: number;
        recordsScanned: number;
        recordsUpdated: number;
        recordsSkipped: number;
        esHealthChecks: {
            timeSpentWaiting: number;     // milliseconds
            checksCount: number;
            unhealthyReasons: {
                [reasonName: string]: number;  // count per reason type
            };
        };
    };
}
```

### Stats Collection

**Per Worker** (`worker.ts:89-103`):
```typescript
const createInitialStatus = (): MigrationStatus => {
    return {
        lastEvaluatedKey: null,
        stats: {
            iterationsCount: 0,
            recordsScanned: 0,
            recordsUpdated: 0,
            recordsSkipped: 0,
            esHealthChecks: {
                timeSpentWaiting: 0,
                checksCount: 0,
                unhealthyReasons: {}
            }
        }
    };
};
```

**Stats Updates Throughout Processing**:
```typescript
// On each iteration
status.stats.iterationsCount++;
status.stats.recordsScanned += result.items.length;

// For each record
if (isFullyMigrated) {
    status.stats.recordsSkipped++;
} else {
    // ... process record ...
    status.stats.recordsUpdated += ddbItemsToBatchWrite.length;
}

// After health checks
status.stats.esHealthChecks.checksCount++;
status.stats.esHealthChecks.timeSpentWaiting += results.runningTime;
status.stats.esHealthChecks.unhealthyReasons[reasonName]++;
```

### Stats Aggregation (`MetaFieldsMigration.ts:178-228`)

Main process aggregates worker stats:
```typescript
const migrationStats = {
    iterationsCount: 0,
    avgIterationDuration: 0,
    recordsScanned: 0,
    avgRecordsScannedPerIteration: 0,
    recordsScannedPerSecond: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    esHealthChecks: {
        timeSpentWaiting: 0,
        checksCount: 0,
        unhealthyReasons: {} as Record<string, any>
    }
};

// Read each worker's log file
for (const logFilePath of logFilePaths) {
    const logFile = JSON.parse(fs.readFileSync(logFilePath, "utf-8"));

    // Sum up metrics
    migrationStats.iterationsCount += logFile.iterationsCount;
    migrationStats.recordsScanned += logFile.recordsScanned;
    migrationStats.recordsUpdated += logFile.recordsUpdated;
    migrationStats.recordsSkipped += logFile.recordsSkipped;

    // Aggregate ES health check stats
    migrationStats.esHealthChecks.timeSpentWaiting +=
        logFile.esHealthChecks.timeSpentWaiting;
    migrationStats.esHealthChecks.checksCount +=
        logFile.esHealthChecks.checksCount;

    // Merge unhealthy reasons
    for (const reason in logFile.esHealthChecks.unhealthyReasons) {
        migrationStats.esHealthChecks.unhealthyReasons[reason] =
            (migrationStats.esHealthChecks.unhealthyReasons[reason] || 0) +
            logFile.esHealthChecks.unhealthyReasons[reason];
    }
}

// Calculate averages
migrationStats.avgIterationDuration = duration / migrationStats.iterationsCount;
migrationStats.avgRecordsScannedPerIteration =
    migrationStats.recordsScanned / migrationStats.iterationsCount;
migrationStats.recordsScannedPerSecond =
    migrationStats.recordsScanned / duration;
```

### Output Format

**Final Summary Log**:
```typescript
this.logger.info(
    migrationStats,
    `Migration summary (based on ${logFilePaths.length} generated logs):`
);
```

**Example Output Structure**:
```json
{
  "iterationsCount": 150,
  "avgIterationDuration": 2.3,
  "recordsScanned": 15000,
  "avgRecordsScannedPerIteration": 100,
  "recordsScannedPerSecond": 43.5,
  "recordsUpdated": 12000,
  "recordsSkipped": 3000,
  "esHealthChecks": {
    "timeSpentWaiting": 5000,
    "checksCount": 25,
    "unhealthyReasons": {
      "highCpuUsage": 10,
      "highMemoryUsage": 15
    }
  }
}
```

## 4. Worker Process Pattern

### Spawning Workers (`SegmentProcessor.ts:34-69`)

```typescript
execute() {
    return execa(
        "node",
        [
            path.join(__dirname, "worker"),
            "--runId", this.runId,
            "--ddbTable", this.ddbTable,
            "--segmentIndex", String(this.segmentIndex),
            "--totalSegments", String(this.totalSegments),
            // ... other args
        ],
        {
            stdio: "inherit",  // Stream output to parent
            env: process.env
        }
    );
}
```

### Parallel Execution (`MetaFieldsMigration.ts:127-141`)

```typescript
const scanProcessesPromises = [];

for (let segmentIndex = 0; segmentIndex < this.totalSegments; segmentIndex++) {
    const segmentProcessor = new SegmentProcessor({
        segmentIndex,
        runId: this.runId,
        totalSegments: this.totalSegments,
        // ... other params
    });

    scanProcessesPromises.push(segmentProcessor.execute());
}

// Wait for all segments to complete
await Promise.all(scanProcessesPromises);
```

## 5. Error Handling & Retries

### Retry with Logging (`worker.ts:447-464`)

```typescript
try {
    await executeWithRetry(execute, {
        onFailedAttempt: error => {
            logger.warn(
                `Batch write attempt #${error.attemptNumber} failed: ${error.message}`
            );
        }
    });
} catch (e) {
    ddbWriteError = true;
    logger.error(
        { error: e, ddbItemsToBatchWrite },
        "After multiple retries, failed to batch-store records in primary DynamoDB table."
    );
}
```

### Stats Accuracy on Errors (`worker.ts:530-536`)

```typescript
if (ddbEsWriteError || ddbWriteError) {
    logger.warn('Not increasing the "recordsUpdated" count due to write errors.');
} else {
    status.stats.recordsUpdated += ddbItemsToBatchWrite.length;
}
```

## 6. Key Takeaways

### Logger Configuration
- Use structured logging (Pino) with pretty printing
- Add context prefix for segments: `msgPrefix: \`[segment #${segmentIndex}]\``
- Use appropriate log levels: `trace` for frequent ops, `info` for milestones, `error` for failures

### Temporary File Strategy
- Write per-worker stats to temp dir with unique naming
- Include run ID and worker ID in filenames
- Write logs on both success and failure paths
- Aggregate logs at the end using glob pattern matching

### Elasticsearch Health Management
- Check health before starting migration
- Check health before each batch write
- Track health check metrics (time spent waiting, unhealthy reasons)
- Disable indexing during migration, restore afterward

### Statistics Tracking
- Track granular metrics per worker
- Aggregate metrics across all workers
- Calculate derived metrics (averages, throughput)
- Include both success and error counts
- Track ES health impact on performance

### Parallel Processing
- Use separate OS processes (not threads) for true parallelism
- Pass all config via CLI args
- Use `stdio: "inherit"` to stream output
- Use `Promise.all()` to wait for all workers
