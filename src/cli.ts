#!/usr/bin/env node
import yargs from "yargs";
import { fileURLToPath } from "node:url";
import { hideBin } from "yargs/helpers";
import { execa } from "execa";
import { bootstrap } from "./bootstrap.ts";
import { loadConfig } from "./features/MigrationConfig/loadConfig.ts";
import { Logger } from "./features/Logger/index.ts";
import {
  BeforeTransferHook,
  AfterTransferHook,
  TransferContext
} from "./features/TransferLifecycle/index.ts";
import { MigrationConfig } from "./features/MigrationConfig/index.ts";
import { processSegment } from "./process-segment.ts";
import { processOsSegment } from "./process-os-segment.ts";

// ============================================================================
// Main CLI
// ============================================================================

yargs(hideBin(process.argv))
  .command(
    "$0",
    "Transfer Webiny data using a configuration file",
    yargs => {
      return yargs.option("config", {
        type: "string",
        demandOption: true,
        description: "Path to configuration file"
      });
    },
    async argv => {
      const config = await loadConfig(argv.config);
      const container = bootstrap({ config });
      const logger = container.resolve(Logger);

      const runId = String(Date.now());
      const segments = config.migration.segments || 1;

      // Register transfer context so hooks can access runId
      container.registerInstance(TransferContext, { runId });

      logConfig(logger, config, runId, segments);

      const startTime = Date.now();

      try {
        // Before-transfer hooks
        const beforeHook = container.resolve(BeforeTransferHook);
        logger.info("Running before-transfer hooks...");
        await beforeHook.execute();

        // Spawn worker processes
        const workerCommand = config.storage === "os" ? "process-os-segment" : "process-segment";
        const workers: Promise<void>[] = [];

        for (let segment = 0; segment < segments; segment++) {
          workers.push(spawnWorker(segment, segments, runId, argv.config, workerCommand));
        }

        await Promise.all(workers);

        // After-transfer hooks (e.g., re-enable OS refresh)
        try {
          const afterHook = container.resolve(AfterTransferHook);
          logger.info("Running after-transfer hooks...");
          await afterHook.execute();
        } catch (error) {
          logger.error(
            `After-transfer hooks failed. Data transfer succeeded, but post-transfer actions may need manual intervention. Error: ${error}`
          );
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`Transfer completed successfully in ${duration}s`);
      } catch (error) {
        logger.error(`Transfer failed: ${error}`);
        process.exit(1);
      }
    }
  )
  .command(
    "process-segment",
    "Process a specific DDB segment (used internally by worker processes)",
    yargs => {
      return yargs
        .option("runId", { type: "string", demandOption: true, description: "Run ID" })
        .option("segment", { type: "number", demandOption: true, description: "Segment number" })
        .option("total", { type: "number", demandOption: true, description: "Total segments" })
        .option("config", { type: "string", demandOption: true, description: "Config file path" });
    },
    async argv => {
      const config = await loadConfig(argv.config);
      if (config.storage !== "ddb") {
        throw new Error(`process-segment requires storage: "ddb". Got: "${config.storage}"`);
      }
      await processSegment({
        runId: argv.runId,
        segment: argv.segment,
        total: argv.total,
        config
      });
    }
  )
  .command(
    "process-os-segment",
    "Process a specific OS table segment (used internally by worker processes)",
    yargs => {
      return yargs
        .option("runId", { type: "string", demandOption: true, description: "Run ID" })
        .option("segment", { type: "number", demandOption: true, description: "Segment number" })
        .option("total", { type: "number", demandOption: true, description: "Total segments" })
        .option("config", { type: "string", demandOption: true, description: "Config file path" });
    },
    async argv => {
      const config = await loadConfig(argv.config);
      if (config.storage !== "os") {
        throw new Error(`process-os-segment requires storage: "os". Got: "${config.storage}"`);
      }
      await processOsSegment({
        runId: argv.runId,
        segment: argv.segment,
        total: argv.total,
        config
      });
    }
  )
  .help()
  .parse();

// ============================================================================
// Helpers
// ============================================================================

function logConfig(
  logger: Logger.Interface,
  config: MigrationConfig.Interface,
  runId: string,
  segments: number
): void {
  logger.info("Starting transfer with configuration:");
  logger.info(`  Run ID: ${runId}`);
  logger.info(`  Storage: ${config.storage}`);
  logger.info(`  Preset: ${config.migration.preset}`);
  logger.info(`  Segments: ${segments}`);

  if (config.storage === "ddb") {
    logger.info(`  Source Region: ${config.source.region}`);
    logger.info(`  Source Table: ${config.source.dynamodb.tableName}`);
    logger.info(`  Source Bucket: ${config.source.s3.bucket}`);
    logger.info(`  Target Region: ${config.target.region}`);
    logger.info(`  Target Table: ${config.target.dynamodb.tableName}`);
    logger.info(`  Target Bucket: ${config.target.s3.bucket}`);
  } else {
    logger.info(`  Source Region: ${config.source.region}`);
    logger.info(`  Source Primary Table: ${config.source.dynamodb.tableName}`);
    logger.info(`  Source OS Table: ${config.source.opensearch.tableName}`);
    logger.info(`  Target Region: ${config.target.region}`);
    logger.info(`  Target OS Table: ${config.target.opensearch.tableName}`);
    logger.info(`  OS Endpoint: ${config.target.opensearch.endpoint}`);
  }
}

async function spawnWorker(
  segment: number,
  total: number,
  runId: string,
  configPath: string,
  command: string = "process-segment"
): Promise<void> {
  const binPath = fileURLToPath(new URL("../bin.js", import.meta.url));

  const args = [
    binPath,
    command,
    "--runId",
    runId,
    "--segment",
    segment.toString(),
    "--total",
    total.toString(),
    "--config",
    configPath
  ];

  const { exitCode } = await execa("node", args, {
    stdio: "inherit"
  });

  if (exitCode !== 0) {
    throw new Error(`Worker process for segment ${segment} failed with code ${exitCode}`);
  }
}
