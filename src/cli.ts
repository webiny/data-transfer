#!/usr/bin/env node
import yargs from "yargs";
import { fileURLToPath } from "node:url";
import { hideBin } from "yargs/helpers";
import { execa } from "execa";
import { createLogger } from "./utils/logger.ts";
import { processSegment } from "./process-segment.ts";
import { processOsSegment } from "./process-os-segment.ts";
import { loadConfig } from "./config/loader.ts";
import { createOpenSearchClient } from "./opensearch/client.ts";
import {
  OpenSearchBeforeMigration,
  OpenSearchAfterMigration
} from "./opensearch/lifecycle.ts";

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
      const config = await loadConfig(argv.config);
      const runId = String(Date.now());
      const segments = config.migration.segments || 1;

      logger.info("Starting migration with configuration:");
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

      const startTime = Date.now();

      // OS lifecycle hooks
      let osClient: import("./opensearch/client.ts").Client | null = null;
      if (config.storage === "os") {
        if (config.target.credentials) {
          osClient = createOpenSearchClient({
            endpoint: config.target.opensearch.endpoint,
            region: config.target.region,
            service: config.target.opensearch.service,
            credentials: config.target.credentials
          });
        } else {
          logger.warn(
            "Target credentials not provided. Lifecycle hooks (disable/enable refresh) will be skipped."
          );
        }
      }

      try {
        if (osClient) {
          const beforeHook = new OpenSearchBeforeMigration(osClient);
          logger.info("Running OpenSearch before-migration hook...");
          await beforeHook.execute();
        }

        // Spawn worker processes
        const workerCommand = config.storage === "os" ? "process-os-segment" : "process-segment";
        const workers: Promise<void>[] = [];

        for (let segment = 0; segment < segments; segment++) {
          workers.push(spawnWorker(segment, segments, runId, argv.config, workerCommand));
        }

        await Promise.all(workers);

        if (osClient) {
          try {
            const afterHook = new OpenSearchAfterMigration(osClient);
            logger.info("Running OpenSearch after-migration hook...");
            await afterHook.execute();
          } catch (error) {
            logger.error(
              { error },
              "Failed to re-enable indexing. Data migration succeeded, but refresh_interval must be restored manually."
            );
          }
        }

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
// Worker Spawning
// ============================================================================

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
