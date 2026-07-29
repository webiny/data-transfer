import { rmSync } from "node:fs";
import { Cleaner as CleanerAbstraction } from "./abstractions/Cleaner.ts";

class CleanerImpl implements CleanerAbstraction.Interface {
    public clean(absDir: string): void {
        rmSync(absDir, { recursive: true, force: true });
    }
}

export const Cleaner = CleanerAbstraction.createImplementation({
    implementation: CleanerImpl,
    dependencies: []
});
