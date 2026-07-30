import { createAbstraction } from "~/base/index.js";
import type { AccessCheck } from "~/domain/pipeline/abstractions/Processor.js";

export interface IAccessChecker {
    run(): Promise<AccessCheck.Report>;
}

export const AccessChecker = createAbstraction<IAccessChecker>("Core/AccessChecker");

export namespace AccessChecker {
    export type Interface = IAccessChecker;
    export type Report = AccessCheck.Report;
    export type Entry = AccessCheck.Entry;
}
