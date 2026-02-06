#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { execa } from "execa";
import { Logger } from "./utils/logger.ts";
import { processSegment, ProcessSegmentOptions } from "./process-segment.ts";

const logger = new Logger("main");

// ============================================================================
// Main CLI
// ============================================================================

yargs(hideBin(process.argv))
  .command(
    "$0",
    "Migrate Webiny v5 data to v6",
    yargs => {
      return yargs
        .option("segments", {
          type: "number",
          default: 1,
          description: "Number of parallel segments to process"
        })
        .option("sourcePrimaryTable", {
          type: "string",
          demandOption: true,
          description: "Source DynamoDB table name"
        })
        .option("targetPrimaryTable", {
          type: "string",
          demandOption: true,
          description: "Target DynamoDB table name"
        })
        .option("sourceFmBucket", {
          type: "string",
          demandOption: true,
          description: "Source S3 bucket for File Manager"
        })
        .option("targetFmBucket", {
          type: "string",
          demandOption: true,
          description: "Target S3 bucket for File Manager"
        })
        .option("models", {
          type: "string",
          description: "Directory containing model JSON files (optional)"
        });
    },
    async argv => {
      logger.info("Starting migration with configuration:");
      logger.info(`  Segments: ${argv.segments}`);
      logger.info(`  Source Table: ${argv.sourcePrimaryTable}`);
      logger.info(`  Target Table: ${argv.targetPrimaryTable}`);
      logger.info(`  Source FM Bucket: ${argv.sourceFmBucket}`);
      logger.info(`  Target FM Bucket: ${argv.targetFmBucket}`);

      const startTime = Date.now();

      try {
        // Spawn worker processes
        const workers: Promise<void>[] = [];

        for (let segment = 0; segment < argv.segments; segment++) {
          workers.push(spawnWorker(segment, argv.segments, argv));
        }

        // Wait for all workers to complete
        await Promise.all(workers);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.success(`Migration completed successfully in ${duration}s`);
      } catch (error) {
        logger.error("Migration failed:", error);
        process.exit(1);
      }
    }
  )
  .command(
    "process-segment",
    "Process a specific segment (used internally by worker processes)",
    yargs => {
      return yargs
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
        .option("sourcePrimaryTable", {
          type: "string",
          demandOption: true,
          description: "Source DynamoDB table name"
        })
        .option("targetPrimaryTable", {
          type: "string",
          demandOption: true,
          description: "Target DynamoDB table name"
        })
        .option("sourceFmBucket", {
          type: "string",
          demandOption: true,
          description: "Source S3 bucket for File Manager"
        })
        .option("targetFmBucket", {
          type: "string",
          demandOption: true,
          description: "Target S3 bucket for File Manager"
        })
        .option("models", {
          type: "string",
          description: "Directory containing model JSON files (optional)"
        });
    },
    async argv => {
      await processSegment(argv as ProcessSegmentOptions);
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
  config: any
): Promise<void> {
  const binPath = new URL("../bin.js", import.meta.url).pathname;

  const args = [
    binPath,
    "process-segment",
    "--segment",
    segment.toString(),
    "--total",
    total.toString(),
    "--sourcePrimaryTable",
    config.sourcePrimaryTable,
    "--targetPrimaryTable",
    config.targetPrimaryTable,
    "--sourceFmBucket",
    config.sourceFmBucket,
    "--targetFmBucket",
    config.targetFmBucket
  ];

  if (config.models) {
    args.push("--models", config.models);
  }

  const { exitCode } = await execa("node", args, {
    stdio: "inherit"
  });

  if (exitCode !== 0) {
    throw new Error(
      `Worker process for segment ${segment} failed with code ${exitCode}`
    );
  }
}
