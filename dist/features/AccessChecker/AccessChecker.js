import { AccessChecker as AccessCheckerAbstraction } from "./abstractions/AccessChecker.js";
import { PipelineRunner } from "../../features/PipelineRunner/index.js";
class AccessCheckerImpl {
  runner;
  constructor(runner) {
    this.runner = runner;
  }
  async run() {
    const processors = this.runner.getProcessors();
    const results = await Promise.allSettled(processors.map(p => p.checkAccess()));
    return results.flatMap((result, i) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      const label = processors[i]?.constructor.name ?? "unknown processor";
      return [{ label, status: "unknown" }];
    });
  }
}
export const AccessChecker = AccessCheckerAbstraction.createImplementation({
  implementation: AccessCheckerImpl,
  dependencies: [PipelineRunner]
});
//# sourceMappingURL=AccessChecker.js.map
