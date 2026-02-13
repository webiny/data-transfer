#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { execa } from "execa";
import { createLogger } from "./utils/logger.ts";
import { processSegment, ProcessSegmentOptions } from "./process-segment.ts";
import { loadConfig } from "./config/loader.ts";
import { MigrationConfiguration } from "./config/types.ts";

const logger = createLogger();

// ============================================================================
// Main CLI
// ============================================================================

yargs(hideBin(process.argv))
  .command(
    "$0",
    "Migrate Webiny v5 data to v6 using a configuration file",
    yargs => {
      return yargs.option("config", {
        type: "string",
        demandOption: true,
        description: "Path to migration configuration file (e.g., migration.config.ts)"
      });
    },
    async argv => {
      // Load configuration
      logger.info(`Loading configuration from: ${argv.config}`);
      const config = await loadConfig(argv.config);

      // Generate unique run ID
      const runId = String(Date.now());

      // Get segments from config or use default
      const segments = config.migration.segments || 1;

      logger.info("Starting migration with configuration:");
      logger.info(`  Run ID: ${runId}`);
      logger.info(`  Preset: ${config.migration.preset}`);
      logger.info(`  Segments: ${segments}`);
      logger.info(`  Source Region: ${config.source.region}`);
      logger.info(`  Source Table: ${config.source.dynamodb.tableName}`);
      logger.info(`  Source Bucket: ${config.source.s3.bucket}`);
      logger.info(`  Target Region: ${config.target.region}`);
      logger.info(`  Target Table: ${config.target.dynamodb.tableName}`);
      logger.info(`  Target Bucket: ${config.target.s3.bucket}`);

      const startTime = Date.now();

      try {
        // Spawn worker processes
        const workers: Promise<void>[] = [];

        for (let segment = 0; segment < segments; segment++) {
          workers.push(spawnWorker(segment, segments, runId, argv.config));
        }

        // Wait for all workers to complete
        await Promise.all(workers);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`Migration completed successfully in ${duration}s`);
      } catch (error) {
        logger.error({ error }, "Migration failed");
        process.exit(1);
      }
    }
  )
  .command(
    "process-segment",
    "Process a specific segment (used internally by worker processes)",
    yargs => {
      return yargs
        .option("runId", {
          type: "string",
          demandOption: true,
          description: "Run ID for this migration"
        })
        .option("segment", {
          type: "number",
          demandOption: true,
          description: "Segment number to process"
        })
        .option("total", {
          type: "number",
          demandOption: true,
          description: "Total number of segments"
        })
        .option("config", {
          type: "string",
          demandOption: true,
          description: "Path to migration configuration file"
        });
    },
    async argv => {
      const config = await loadConfig(argv.config);
      await processSegment({
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
// Worker Spawning
// ============================================================================

async function spawnWorker(
  segment: number,
  total: number,
  runId: string,
  configPath: string
): Promise<void> {
  const binPath = new URL("../bin.js", import.meta.url).pathname;

  const args = [
    binPath,
    "process-segment",
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
