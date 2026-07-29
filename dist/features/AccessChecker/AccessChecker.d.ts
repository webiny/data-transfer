import { AccessChecker as AccessCheckerAbstraction } from "./abstractions/AccessChecker.ts";
import { PipelineRunner } from "../../features/PipelineRunner/index.js";
import type { AccessCheck } from "../../domain/pipeline/abstractions/Processor.js";
export type { IAccessChecker } from "./abstractions/AccessChecker.js";
declare class AccessCheckerImpl implements AccessCheckerAbstraction.Interface {
  private readonly runner;
  constructor(runner: PipelineRunner.Interface);
  run(): Promise<AccessCheck.Report>;
}
export declare const AccessChecker: typeof AccessCheckerImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/AccessChecker.ts").IAccessChecker
  >;
};
//# sourceMappingURL=AccessChecker.d.ts.map
