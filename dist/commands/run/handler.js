import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { execa } from "execa";
import { bootstrap } from "../../bootstrap.js";
import { formatError } from "../../base/index.js";
import { PipelineRunner } from "../../features/PipelineRunner/index.js";
import { PipelineBuilderFactory } from "../../features/PipelineBuilderFactory/index.js";
import { loadConfig } from "../../features/MigrationConfig/loadConfig.js";
import { Logger } from "../../tools/Logger/index.js";
import {
  BeforeTransferHook,
  AfterTransferHook,
  TransferContext
} from "../../features/TransferLifecycle/index.js";
import { PresetLoader } from "../../features/PresetLoader/index.js";
import { AccessChecker } from "../../features/AccessChecker/index.js";
import { loadUserSetup } from "../../utils/loadUserSetup.js";
import { findPackageRoot } from "../../utils/findPackageRoot.js";
import { resolveSegmentsToRun } from "./segmentsFilter.js";
class AccessCheckError extends Error {
  constructor(count) {
    super(`Access check failed — ${count} resource(s) denied or missing`);
    this.name = "AccessCheckError";
  }
}
export async function handler(configPath, presetName, segmentsFilter, logLevel, dryRun = false) {
  const runId = String(Date.now());
  let container;
  let logger;
  let config;
  try {
    config = await loadConfig(configPath);
    container = bootstrap({
      config,
      runId,
      logLevel: logLevel ?? config.debug?.logLevel
    });
    logger = container.resolve(Logger);
  } catch (error) {
    // Config-load / Zod validation failures happen before we have a logger
    // — write directly to stderr so the user sees the friendly format.
    const verbose = (logLevel ?? "debug") === "debug";
    process.stderr.write(`\n${formatError(error, verbose)}\n`);
    process.exit(1);
  }
  const resolvedLogLevel = logLevel ?? config.debug?.logLevel;
  const verbose = (resolvedLogLevel ?? "debug") === "debug";
  const segments = config.pipeline?.segments || 1;
  let segmentsToRun;
  try {
    segmentsToRun = resolveSegmentsToRun(segments, segmentsFilter);
  } catch (error) {
    process.stderr.write(`\n${formatError(error, verbose)}\n`);
    process.exit(1);
  }
  container.registerInstance(TransferContext, { runId, dryRun });
  if (dryRun) {
    logger.warn("DRY RUN: no writes will be made to the target system.");
  }
  logConfig({
    logger,
    config,
    runId,
    segments,
    segmentsToRun,
    presetName,
    logLevel: logLevel ?? config.debug?.logLevel
  });
  const startTime = Date.now();
  try {
    await loadUserSetup(configPath, container, logger);
    if (config.register) {
      await config.register(container);
    }
    const presetLoader = container.resolve(PresetLoader);
    const preset = await presetLoader.load(presetName);
    const runner = container.resolve(PipelineRunner);
    const pipelineBuilderFactory = container.resolve(PipelineBuilderFactory);
    await preset.configure({ runner, pipelineBuilderFactory, container });
    pipelineBuilderFactory.warnUnmatchedCustomizers(logger);
    const accessChecker = container.resolve(AccessChecker);
    const accessReport = await accessChecker.run();
    if (accessReport.length > 0) {
      logger.info("Pre-transfer access check:");
      for (const entry of accessReport) {
        if (entry.status === "ok") {
          logger.info(`  ok       ${entry.label}`);
        } else if (entry.status === "denied") {
          logger.error(`  DENIED   ${entry.label}`);
          if (entry.hint) {
            logger.error(`           ${entry.hint}`);
          }
        } else if (entry.status === "missing") {
          logger.error(`  MISSING  ${entry.label}`);
          if (entry.hint) {
            logger.error(`           ${entry.hint}`);
          }
        } else {
          logger.warn(`  unknown  ${entry.label}`);
        }
      }
    }
    const blocked = accessReport.filter(e => e.status === "denied" || e.status === "missing");
    if (blocked.length > 0) {
      throw new AccessCheckError(blocked.length);
    }
    const beforeHook = container.resolve(BeforeTransferHook);
    logger.info("Running before-transfer hooks...");
    await beforeHook.execute();
    const workers = segmentsToRun.map(segment =>
      spawnWorker(
        segment,
        segments,
        runId,
        configPath,
        presetName,
        logLevel ?? config.debug?.logLevel,
        dryRun
      )
    );
    const results = await Promise.allSettled(workers);
    const failures = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const segment = segmentsToRun[index];
        failures.push(segment);
        logger.error(`Segment ${segment} failed: ${formatError(result.reason, verbose)}`);
      }
    });
    logger.info(
      `${segmentsToRun.length - failures.length} of ${segmentsToRun.length} shards succeeded` +
        (failures.length > 0 ? ` (failed: ${failures.join(", ")})` : "")
    );
    await logRunTotal(join(process.cwd(), ".transfer", runId, "stats"), logger);
    try {
      const afterHook = container.resolve(AfterTransferHook);
      logger.info("Running after-transfer hooks...");
      await afterHook.execute();
    } catch (error) {
      logger.error(
        `After-transfer hooks failed. Data transfer state may need manual intervention. ${formatError(error, verbose)}`
      );
    }
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    if (failures.length > 0) {
      logger.error(`Transfer completed with ${failures.length} failed shard(s) in ${duration}s`);
      process.exit(1);
    }
    logger.info(`Transfer completed successfully in ${duration}s`);
  } catch (error) {
    logger.error(`Transfer failed: ${formatError(error, verbose)}`);
    process.exit(1);
  }
}
function logConfig({ logger, config, runId, segments, segmentsToRun, presetName, logLevel }) {
  logger.info("Starting transfer with configuration:");
  logger.info(`  Run ID: ${runId}`);
  logger.info(`  Preset: ${presetName}`);
  logger.info(`  Log Level: ${logLevel ?? "debug"}`);
  if (segmentsToRun.length === segments) {
    logger.info(`  Segments: ${segments}`);
  } else {
    logger.info(`  Segments: ${segments} (running only [${segmentsToRun.join(", ")}])`);
  }
  logger.info(`  Source Region: ${config.source.region}`);
  logger.info(`  Source DDB Table: ${config.source.dynamodb.tableName}`);
  logger.info(`  Source S3 Bucket: ${config.source.s3.bucket}`);
  if (config.source.opensearch) {
    logger.info(`  Source OS Table: ${config.source.opensearch.tableName}`);
  }
  logger.info(`  Target Region: ${config.target.region}`);
  logger.info(`  Target DDB Table: ${config.target.dynamodb.tableName}`);
  logger.info(`  Target S3 Bucket: ${config.target.s3.bucket}`);
  if (config.target.opensearch) {
    logger.info(`  Target OS Table: ${config.target.opensearch.tableName}`);
    logger.info(`  OS Endpoint: ${config.target.opensearch.endpoint}`);
  }
}
async function spawnWorker(
  segment,
  total,
  runId,
  configPath,
  presetName,
  logLevel,
  dryRun = false
) {
  const binPath = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "bin.js");
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
    configPath,
    "--preset",
    presetName,
    ...(logLevel ? ["--log-level", logLevel] : []),
    ...(dryRun ? ["--dry-run"] : [])
  ];
  const { exitCode } = await execa("node", args, {
    stdio: "inherit"
  });
  if (exitCode !== 0) {
    throw new Error(`Worker process for segment ${segment} failed with code ${exitCode}`);
  }
}
async function logRunTotal(statsDir, logger) {
  let files;
  try {
    files = (await readdir(statsDir)).filter(f => f.endsWith(".json"));
  } catch {
    return;
  }
  const transferred = {};
  const blackholed = {};
  const unmatched = {};
  let mergeGroupId = "";
  for (const file of files) {
    let stats;
    try {
      stats = JSON.parse(await readFile(join(statsDir, file), "utf8"));
    } catch {
      continue;
    }
    mergeGroupId = stats.mergeGroupId;
    for (const [name, count] of Object.entries(stats.transferred)) {
      transferred[name] = (transferred[name] ?? 0) + count;
    }
    for (const [name, count] of Object.entries(stats.blackholed)) {
      blackholed[name] = (blackholed[name] ?? 0) + count;
    }
    for (const [type, count] of Object.entries(stats.unmatched)) {
      unmatched[type] = (unmatched[type] ?? 0) + count;
    }
  }
  if (!mergeGroupId) {
    return;
  }
  const sumRecord = r => Object.values(r).reduce((a, b) => a + b, 0);
  const formatDetail = r => {
    const entries = Object.entries(r);
    if (entries.length === 0) {
      return "";
    }
    return ` (${entries.map(([k, v]) => `${k}=${v}`).join(", ")})`;
  };
  const transferredTotal = sumRecord(transferred);
  const blackholedTotal = sumRecord(blackholed);
  const unmatchedTotal = sumRecord(unmatched);
  const scannedTotal = transferredTotal + blackholedTotal + unmatchedTotal;
  logger.info(
    `[${mergeGroupId}] TOTAL: scanned ${scannedTotal}, ` +
      `transferred ${transferredTotal}${formatDetail(transferred)}, ` +
      `blackholed ${blackholedTotal}${formatDetail(blackholed)}, ` +
      `unmatched ${unmatchedTotal}${formatDetail(unmatched)}`
  );
}
//# sourceMappingURL=handler.js.map
