import { execFileSync } from "node:child_process";
import { Compiler as CompilerAbstraction } from "./abstractions/Compiler.ts";
import { ProjectConfig } from "./abstractions/ProjectConfig.ts";
import { bin } from "../../bin.ts";

class CompilerImpl implements CompilerAbstraction.Interface {
    private readonly config: ProjectConfig.Interface;

    public constructor(config: ProjectConfig.Interface) {
        this.config = config;
    }

    public compile(packageRelDir: string): void {
        execFileSync(bin("tsc"), ["-b", "--force", packageRelDir], {
            cwd: this.config.rootDir,
            stdio: "inherit"
        });
    }
}

export const Compiler = CompilerAbstraction.createImplementation({
    implementation: CompilerImpl,
    dependencies: [ProjectConfig]
});
