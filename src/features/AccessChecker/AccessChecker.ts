import { AccessChecker as AccessCheckerAbstraction } from "./abstractions/AccessChecker.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import type { AccessCheck } from "~/domain/pipeline/abstractions/Processor.ts";

class AccessCheckerImpl implements AccessCheckerAbstraction.Interface {
    public constructor(private readonly runner: PipelineRunner.Interface) {}

    public async run(): Promise<AccessCheck.Report> {
        const processors = this.runner.getProcessors();
        const results = await Promise.allSettled(processors.map(p => p.checkAccess()));
        return results.flatMap((result, i) => {
            if (result.status === "fulfilled") {
                return result.value;
            }
            const label = processors[i].constructor.name ?? "unknown processor";
            return [{ label, status: "unknown" as const }];
        });
    }
}

export const AccessChecker = AccessCheckerAbstraction.createImplementation({
    implementation: AccessCheckerImpl,
    dependencies: [PipelineRunner]
});
