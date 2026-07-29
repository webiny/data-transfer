import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { WorkerSpawner as WorkerSpawnerAbstraction } from "./abstractions/WorkerSpawner.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { findPackageRoot } from "../../utils/findPackageRoot.js";
class WorkerSpawnerImpl {
  logger;
  binPath;
  constructor(logger) {
    this.logger = logger;
    this.binPath = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "bin.js");
  }
  async spawn(options) {
    const args = [
      this.binPath,
      options.command,
      "--runId",
      options.runId,
      "--segment",
      options.segment.toString(),
      "--total",
      options.totalSegments.toString(),
      "--config",
      options.configPath
    ];
    this.logger.info(`Spawning worker for segment ${options.segment}/${options.totalSegments}`);
    const { exitCode } = await execa("node", args, {
      stdio: "inherit"
    });
    if (exitCode !== 0) {
      throw new Error(`Worker process for segment ${options.segment} failed with code ${exitCode}`);
    }
  }
}
export const WorkerSpawner = WorkerSpawnerAbstraction.createImplementation({
  implementation: WorkerSpawnerImpl,
  dependencies: [Logger]
});
//# sourceMappingURL=WorkerSpawner.js.map
