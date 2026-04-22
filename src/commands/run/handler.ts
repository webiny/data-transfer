import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { bootstrap } from "~/bootstrap.ts";
import { formatError } from "~/base/index.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { MigrationConfig } from "~/features/MigrationConfig/index.ts";
import {
    BeforeTransferHook,
    AfterTransferHook,
    TransferContext
} from "~/features/TransferLifecycle/index.ts";
import { loadUserSetup } from "~/utils/loadUserSetup.ts";
import { resolveSegmentsToRun } from "./segmentsFilter.ts";

export async function handler(
    configPath: string,
    segmentsFilter?: number[],
    logLevel?: string
): Promise<void> {
    const runId = String(Date.now());
    let container;
    let logger;
    let config;
    try {
        config = await loadConfig(configPath);
        container = bootstrap({
            config,
            runId,
            logLevel: (logLevel ?? config.debug?.logLevel) as "debug" | "info" | "warn" | "error" | undefined
        });
        logger = container.resolve(Logger);
    } catch (error) {
        // Config-load / Zod validation failures happen before we have a logger
        // — write directly to stderr so the user sees the friendly format.
        process.stderr.write(`\n${formatError(error)}\n`);
        process.exit(1);
    }

    const segments = config.pipeline.segments || 1;

    let segmentsToRun: number[];
    try {
        segmentsToRun = resolveSegmentsToRun(segments, segmentsFilter);
    } catch (error) {
        process.stderr.write(`\n${formatError(error)}\n`);
        process.exit(1);
    }

    container.registerInstance(TransferContext, { runId });

    logConfig(logger, config, runId, segments, segmentsToRun);

    const startTime = Date.now();

    try {
        await loadUserSetup(configPath, container, logger);

        const beforeHook = container.resolve(BeforeTransferHook);
        logger.info("Running before-transfer hooks...");
        await beforeHook.execute();

        const workers = segmentsToRun.map(segment =>
            spawnWorker(segment, segments, runId, configPath, logLevel ?? config.debug?.logLevel)
        );

        const results = await Promise.allSettled(workers);
        const failures: number[] = [];
        results.forEach((result, index) => {
            if (result.status === "rejected") {
                const segment = segmentsToRun[index];
                failures.push(segment);
                logger.error(`Segment ${segment} failed: ${formatError(result.reason)}`);
            }
        });
        logger.info(
            `${segmentsToRun.length - failures.length} of ${segmentsToRun.length} shards succeeded` +
                (failures.length > 0 ? ` (failed: ${failures.join(", ")})` : "")
        );

        try {
            const afterHook = container.resolve(AfterTransferHook);
            logger.info("Running after-transfer hooks...");
            await afterHook.execute();
        } catch (error) {
            logger.error(
                `After-transfer hooks failed. Data transfer state may need manual intervention. ${formatError(error)}`
            );
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        if (failures.length > 0) {
            logger.error(
                `Transfer completed with ${failures.length} failed shard(s) in ${duration}s`
            );
            process.exit(1);
        }
        logger.info(`Transfer completed successfully in ${duration}s`);
    } catch (error) {
        logger.error(`Transfer failed: ${formatError(error)}`);
        process.exit(1);
    }
}

function logConfig(
    logger: Logger.Interface,
    config: MigrationConfig.Interface,
    runId: string,
    segments: number,
    segmentsToRun: number[]
): void {
    logger.info("Starting transfer with configuration:");
    logger.info(`  Run ID: ${runId}`);
    logger.info(`  Storage: ${config.storage}`);
    logger.info(`  Preset: ${config.pipeline.preset}`);
    if (segmentsToRun.length === segments) {
        logger.info(`  Segments: ${segments}`);
    } else {
        logger.info(`  Segments: ${segments} (running only [${segmentsToRun.join(", ")}])`);
    }

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
    logLevel?: string
): Promise<void> {
    const binPath = fileURLToPath(new URL("../../../bin.js", import.meta.url));

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
        ...(logLevel ? ["--log-level", logLevel] : [])
    ];

    const { exitCode } = await execa("node", args, {
        stdio: "inherit"
    });

    if (exitCode !== 0) {
        throw new Error(`Worker process for segment ${segment} failed with code ${exitCode}`);
    }
}
