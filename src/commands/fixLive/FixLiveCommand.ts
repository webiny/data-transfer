import type { Argv } from "yargs";
import { join, resolve } from "node:path";
import type { Container } from "@webiny/di";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import { UI } from "~/commands/prompts/abstractions/UI.js";
import { EXIT_CANCELLED, EXIT_FAILURE, EXIT_OK } from "~/commands/exitCodes.js";
import { discoverConfig } from "~/commands/transfer/wizard/configDiscovery.js";
import { bootstrap } from "~/bootstrap.js";
import { formatError } from "~/base/index.js";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.js";
import type { MigrationConfig } from "~/features/MigrationConfig/index.js";
import { TransferContext } from "~/features/TransferLifecycle/index.js";
import { SourceDynamoDbClient, TargetDynamoDbClient } from "~/services/DynamoDbClient/index.js";
import {
    ChangeReport,
    DdbLiveFieldRunner,
    OsLiveFieldRunner,
    FixLiveState,
    type LiveFieldRunner
} from "~/features/FixLive/index.js";
import type { SystemConfig, SystemName, TableKind } from "./types.ts";
import type { StepCancelled, StepRefused } from "./steps/outcome.ts";
import { selectProject } from "./steps/selectProject.ts";
import { selectSystem } from "./steps/selectSystem.ts";
import { guardV6 } from "./steps/guardV6.ts";
import { confirmSystem } from "./steps/confirmSystem.ts";
import { selectMode } from "./steps/selectMode.ts";
import { runTable, type TableRunResult } from "./steps/runTable.ts";
import { summarise, totalChanges, totalSkips } from "./steps/summarise.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

interface FixLiveOptions {
    project?: string;
    system?: SystemName;
    mode?: LiveFieldRunner.Mode;
    yes: boolean;
    table?: TableKind;
    concurrency: number;
    logLevel?: LogLevel;
}

const DEFAULT_CONCURRENCY = 4;

function parseOptions(argv: CommandAbstraction.Argv): FixLiveOptions {
    let mode: LiveFieldRunner.Mode | undefined;
    if (argv.live === true) {
        mode = "live";
    } else if (argv["dry-run"] === true) {
        mode = "dry-run";
    }
    return {
        project: argv.project as string | undefined,
        system: argv.system as SystemName | undefined,
        mode,
        yes: argv.yes === true,
        table: argv.table as TableKind | undefined,
        concurrency: typeof argv.concurrency === "number" ? argv.concurrency : DEFAULT_CONCURRENCY,
        logLevel: argv["log-level"] as LogLevel | undefined
    };
}

function resolveTables(restriction: TableKind | undefined, system: SystemConfig): TableKind[] {
    if (restriction) {
        return [restriction];
    }
    return system.opensearch ? ["ddb", "os"] : ["ddb"];
}

class FixLiveCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "fix-live";
    public readonly description =
        "Reconcile the `live` field on CMS entries of an already migrated v6 system";

    public constructor(
        private readonly prompts: Prompts.Interface,
        private readonly ui: UI.Interface
    ) {}

    public configure(yargs: Argv): Argv {
        return yargs
            .option("project", {
                type: "string",
                description: "Project folder under projects/"
            })
            .option("system", {
                type: "string",
                choices: ["source", "target"] as const,
                description: "Which system of the project to reconcile"
            })
            .option("dry-run", {
                type: "boolean",
                description: "Report changes without writing"
            })
            .option("live", {
                type: "boolean",
                description:
                    "Apply changes (requires a completed dry run for the same project and system)"
            })
            .conflicts("dry-run", "live")
            .option("yes", {
                type: "boolean",
                default: false,
                description: "Skip confirmations"
            })
            .option("table", {
                type: "string",
                choices: ["ddb", "os"] as const,
                description: "Restrict to one table (default: both)"
            })
            .option("concurrency", {
                type: "number",
                default: DEFAULT_CONCURRENCY,
                description: "Scan segments in flight"
            })
            .option("log-level", {
                type: "string",
                choices: ["debug", "info", "warn", "error"] as const,
                description: "Log level (default: from config)"
            });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        const options = parseOptions(argv);
        const cwd = process.cwd();

        const project = await selectProject({
            prompts: this.prompts,
            cwd,
            projectArg: options.project
        });
        if (project.kind !== "ok") {
            return this.finish(project);
        }

        const configPath = await discoverConfig(resolve(join(cwd, "projects", project.value)));
        if (!configPath) {
            return this.refuse(`No config.ts found in projects/${project.value}/.`);
        }

        const runId = String(Date.now());
        let config: MigrationConfig.Interface;
        let container: Container;
        try {
            config = await loadConfig(configPath);
            container = bootstrap({
                config,
                runId,
                logLevel: options.logLevel ?? config.debug?.logLevel
            });
        } catch (error) {
            return this.refuse(formatError(error, false));
        }

        const system = await selectSystem({
            prompts: this.prompts,
            config,
            systemArg: options.system
        });
        if (system.kind !== "ok") {
            return this.finish(system);
        }
        const systemConfig: SystemConfig = config[system.value];
        const client =
            system.value === "source"
                ? container.resolve(SourceDynamoDbClient)
                : container.resolve(TargetDynamoDbClient);

        if (options.table === "os" && !systemConfig.opensearch) {
            return this.refuse(`System "${system.value}" has no OpenSearch table configured.`);
        }

        const guard = await guardV6({
            client,
            tableName: systemConfig.dynamodb.tableName,
            region: systemConfig.region,
            ui: this.ui
        });
        if (guard.kind !== "ok") {
            return this.finish(guard);
        }

        const confirmed = await confirmSystem({
            prompts: this.prompts,
            ui: this.ui,
            system: system.value,
            config: systemConfig,
            yes: options.yes
        });
        if (confirmed.kind !== "ok") {
            return this.finish(confirmed);
        }

        const fixLiveState = container.resolve(FixLiveState);
        const stateKey = { project: project.value, system: system.value };
        const state = fixLiveState.read(stateKey);
        const mode = await selectMode({
            prompts: this.prompts,
            state,
            modeArg: options.mode,
            yes: options.yes
        });
        if (mode.kind !== "ok") {
            return this.finish(mode);
        }

        container.registerInstance(TransferContext, {
            runId,
            dryRun: mode.value === "dry-run"
        });
        const report = container.resolve(ChangeReport);
        const segments = config.pipeline?.segments || 1;

        const results: TableRunResult[] = [];
        try {
            for (const table of resolveTables(options.table, systemConfig)) {
                const tableName =
                    table === "ddb"
                        ? systemConfig.dynamodb.tableName
                        : systemConfig.opensearch!.tableName;
                const runner =
                    table === "ddb"
                        ? container.resolve(DdbLiveFieldRunner)
                        : container.resolve(OsLiveFieldRunner);
                const target: LiveFieldRunner.Target = {
                    client,
                    tableName,
                    segments,
                    concurrency: options.concurrency
                };
                results.push(
                    await runTable({
                        table,
                        tableName,
                        region: systemConfig.region,
                        runner,
                        target,
                        mode: mode.value,
                        report,
                        ui: this.ui
                    })
                );
            }
        } catch (error) {
            return this.refuse(`fix-live failed: ${formatError(error, false)}`);
        }

        if (mode.value === "dry-run") {
            fixLiveState.recordDryRun(stateKey, {
                runId,
                at: new Date().toISOString(),
                changes: totalChanges(results),
                skips: totalSkips(results)
            });
        } else {
            fixLiveState.recordLiveRun(stateKey, {
                runId,
                at: new Date().toISOString(),
                changes: totalChanges(results),
                skips: totalSkips(results),
                written: results.reduce((total, result) => total + result.stats.written, 0),
                conditionFailed: results.reduce(
                    (total, result) => total + result.stats.conditionFailed,
                    0
                )
            });
        }

        summarise({
            ui: this.ui,
            project: project.value,
            system: system.value,
            mode: mode.value,
            results,
            reportPath: join(".transfer", runId, "fix-live-report.jsonl"),
            statePath: join(
                ".transfer",
                "state",
                "fix-live",
                `${project.value}__${system.value}.json`
            ),
            lastDryRun: state?.lastDryRun
        });
        return EXIT_OK;
    }

    private finish(outcome: StepCancelled | StepRefused): number {
        if (outcome.kind === "cancelled") {
            this.ui.cancel("Cancelled.");
            return EXIT_CANCELLED;
        }
        return this.refuse(outcome.message);
    }

    private refuse(message: string): number {
        this.ui.error(message);
        return EXIT_FAILURE;
    }
}

export const FixLiveCommand = CommandAbstraction.createImplementation({
    implementation: FixLiveCommandImpl,
    dependencies: [Prompts, UI]
});
