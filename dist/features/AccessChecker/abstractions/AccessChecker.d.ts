import type { AccessCheck } from "../../../domain/pipeline/abstractions/Processor.js";
export interface IAccessChecker {
  run(): Promise<AccessCheck.Report>;
}
export declare const AccessChecker: import("@webiny/di").Abstraction<IAccessChecker>;
export declare namespace AccessChecker {
  type Interface = IAccessChecker;
  type Report = AccessCheck.Report;
  type Entry = AccessCheck.Entry;
}
//# sourceMappingURL=AccessChecker.d.ts.map
