import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { execa } from "execa";
import { bootstrap } from "~/bootstrap.ts";
import { formatError } from "~/base/index.ts";
import type { RunStats } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { MigrationConfig } from "~/features/MigrationConfig/index.ts";
import {
    BeforeTransferHook,
    AfterTransferHook,
    TransferContext
} from "~/features/TransferLifecycle/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { loadUserSetup } from "~/utils/loadUserSetup.ts";
import { resolveSegmentsToRun } from "./segmentsFilter.ts";

export async function handler(
    configPath: string,
    presetName: string,
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
            logLevel: (logLevel ?? config.debug?.logLevel) as
                | "debug"
                | "info"
                | "warn"
                | "error"
                | undefined
        });
        logger = container.resolve(Logger);
    } catch (error) {
        // Config-load / Zod validation failures happen before we have a logger
        // — write directly to stderr so the user sees the friendly format.
        const verbose = (logLevel ?? "info") === "debug";
        process.stderr.write(`\n${formatError(error, verbose)}\n`);
        process.exit(1);
    }

    const resolvedLogLevel = (logLevel ?? config.debug?.logLevel) as string | undefined;
    const verbose = resolvedLogLevel === "debug";
    const segments = config.pipeline?.segments || 1;

    let segmentsToRun: number[];
    try {
        segmentsToRun = resolveSegmentsToRun(segments, segmentsFilter);
    } catch (error) {
        process.stderr.write(`\n${formatError(error, verbose)}\n`);
        process.exit(1);
    }

    container.registerInstance(TransferContext, { runId });

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

        const presetLoader = container.resolve(PresetLoader);
        await presetLoader.load(presetName);

        const beforeHook = container.resolve(BeforeTransferHook);
        logger.info("Running before-transfer hooks...");
        await beforeHook.execute();

        const workers = segmentsToRun.map(segment =>
            spawnWorker(segment, segments, runId, configPath, presetName, logLevel ?? config.debug?.logLevel)
        );

        const results = await Promise.allSettled(workers);
        const failures: number[] = [];
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
            logger.error(
                `Transfer completed with ${failures.length} failed shard(s) in ${duration}s`
            );
            process.exit(1);
        }
        logger.info(`Transfer completed successfully in ${duration}s`);
    } catch (error) {
        logger.error(`Transfer failed: ${formatError(error, verbose)}`);
        process.exit(1);
    }
}

interface LogConfigParams {
    logger: Logger.Interface;
    config: MigrationConfig.Interface;
    runId: string;
    segments: number;
    segmentsToRun: number[];
    presetName: string;
    logLevel?: string;
}

function logConfig({
    logger,
    config,
    runId,
    segments,
    segmentsToRun,
    presetName,
    logLevel
}: LogConfigParams): void {
    logger.info("Starting transfer with configuration:");
    logger.info(`  Run ID: ${runId}`);
    logger.info(`  Preset: ${presetName}`);
    logger.info(`  Log Level: ${logLevel ?? "info"}`);
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
    segment: number,
    total: number,
    runId: string,
    configPath: string,
    presetName: string,
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
        "--preset",
        presetName,
        ...(logLevel ? ["--log-level", logLevel] : [])
    ];

    const { exitCode } = await execa("node", args, {
        stdio: "inherit"
    });

    if (exitCode !== 0) {
        throw new Error(`Worker process for segment ${segment} failed with code ${exitCode}`);
    }
}

async function logRunTotal(statsDir: string, logger: Logger.Interface): Promise<void> {
    let files: string[];
    try {
        files = (await readdir(statsDir)).filter(f => f.endsWith(".json"));
    } catch {
        return;
    }

    const transferred: Record<string, number> = {};
    const blackholed: Record<string, number> = {};
    const unmatched: Record<string, number> = {};
    let mergeGroupId = "";

    for (const file of files) {
        let stats: RunStats;
        try {
            stats = JSON.parse(await readFile(join(statsDir, file), "utf8")) as RunStats;
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

    const sumRecord = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    const formatDetail = (r: Record<string, number>) => {
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
