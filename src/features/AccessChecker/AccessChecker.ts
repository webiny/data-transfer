import { AccessChecker as AccessCheckerAbstraction } from "./abstractions/AccessChecker.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import type { AccessCheck } from "~/domain/pipeline/abstractions/Processor.ts";

class AccessCheckerImpl implements AccessCheckerAbstraction.Interface {
    public constructor(private readonly runner: PipelineRunner.Interface) {}

    public async run(): Promise<AccessCheck.Report> {
        const processors = this.runner.getProcessors();
        const nested = await Promise.all(processors.map(p => p.checkAccess()));
        return nested.flat();
    }
}

export const AccessChecker = AccessCheckerAbstraction.createImplementation({
    implementation: AccessCheckerImpl,
    dependencies: [PipelineRunner]
});
