import { join } from "node:path";
import { FixLiveState as FixLiveStateAbstraction } from "./abstractions/FixLiveState.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.js";

export type { IFixLiveState } from "./abstractions/FixLiveState.js";

class FixLiveStateImpl implements FixLiveStateAbstraction.Interface {
    public constructor(private readonly fileTool: FileTool.Interface) {}

    public pathFor(key: FixLiveStateAbstraction.Key): string {
        return join(
            process.cwd(),
            ".transfer",
            "state",
            "fix-live",
            `${key.project}__${key.system}.json`
        );
    }

    public read(key: FixLiveStateAbstraction.Key): FixLiveStateAbstraction.File | null {
        const path = this.pathFor(key);
        if (!this.fileTool.exists(path)) {
            return null;
        }
        return JSON.parse(this.fileTool.readFileOrThrow(path)) as FixLiveStateAbstraction.File;
    }

    public recordDryRun(
        key: FixLiveStateAbstraction.Key,
        summary: FixLiveStateAbstraction.RunSummary
    ): void {
        this.write(key, { ...(this.read(key) ?? {}), lastDryRun: summary });
    }

    public recordLiveRun(
        key: FixLiveStateAbstraction.Key,
        summary: FixLiveStateAbstraction.LiveRunSummary
    ): void {
        this.write(key, { ...(this.read(key) ?? {}), lastLiveRun: summary });
    }

    private write(key: FixLiveStateAbstraction.Key, file: FixLiveStateAbstraction.File): void {
        this.fileTool.writeFileOrThrow(this.pathFor(key), `${JSON.stringify(file, null, 2)}\n`);
    }
}

export const FixLiveState = FixLiveStateAbstraction.createImplementation({
    implementation: FixLiveStateImpl,
    dependencies: [FileTool]
});
