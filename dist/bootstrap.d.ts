import { Container } from "@webiny/di";
import { MigrationConfig } from "./features/MigrationConfig/index.js";
export interface BootstrapOptions {
  config: MigrationConfig.Interface;
  logLevel?: "debug" | "info" | "warn" | "error";
  json?: boolean;
  /**
   * Run ID — used to resolve the default log file path under
   * `.transfer/<runId>/logs/...`. Required when
   * `config.debug.logFile === true` (default-path mode); optional
   * otherwise. Handlers pass this from argv.runId (workers) or a
   * freshly generated value (orchestrator).
   */
  runId?: string;
}
export declare function bootstrap(options: BootstrapOptions): Container;
//# sourceMappingURL=bootstrap.d.ts.map
