import { BuildOrchestrator as BuildOrchestratorAbstraction } from "./abstractions/BuildOrchestrator.ts";
import { ProjectConfig } from "./abstractions/ProjectConfig.ts";
import { Cleaner } from "./abstractions/Cleaner.ts";
import { Compiler } from "./abstractions/Compiler.ts";
import { ArtifactCopier } from "./abstractions/ArtifactCopier.ts";
import { PathAliasRewriter } from "./abstractions/PathAliasRewriter.ts";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

class BuildOrchestratorImpl implements BuildOrchestratorAbstraction.Interface {
  private readonly config: ProjectConfig.Interface;
  private readonly cleaner: Cleaner.Interface;
  private readonly compiler: Compiler.Interface;
  private readonly artifactCopier: ArtifactCopier.Interface;
  private readonly pathAliasRewriter: PathAliasRewriter.Interface;

  public constructor(
    config: ProjectConfig.Interface,
    cleaner: Cleaner.Interface,
    compiler: Compiler.Interface,
    artifactCopier: ArtifactCopier.Interface,
    pathAliasRewriter: PathAliasRewriter.Interface
  ) {
    this.config = config;
    this.cleaner = cleaner;
    this.compiler = compiler;
    this.artifactCopier = artifactCopier;
    this.pathAliasRewriter = pathAliasRewriter;
  }

  public run(): void {
    const { rootDir, slices } = this.config;
    const distDir = join(rootDir, "dist");

    this.cleaner.clean(distDir);

    for (const slice of slices) {
      this.compiler.compile(slice);
    }

    this.pathAliasRewriter.rewrite(distDir);
    this.ensureShebang(rootDir);

    this.artifactCopier.copyAssets(rootDir, distDir);
    this.artifactCopier.copyPackageJson(rootDir, distDir);
    this.artifactCopier.copyReadme(rootDir, distDir);
    this.artifactCopier.copyLicense(rootDir, distDir);
  }

  private ensureShebang(rootDir: string): void {
    for (const binPath of ["dist/cli.js", "dist/mcp/bin.js"]) {
      const fullPath = join(rootDir, binPath);
      if (!existsSync(fullPath)) {
        continue;
      }
      const content = readFileSync(fullPath, "utf-8");
      if (!content.startsWith("#!")) {
        writeFileSync(fullPath, "#!/usr/bin/env node\n" + content);
      }
    }
  }
}

export const BuildOrchestrator = BuildOrchestratorAbstraction.createImplementation({
  implementation: BuildOrchestratorImpl,
  dependencies: [ProjectConfig, Cleaner, Compiler, ArtifactCopier, PathAliasRewriter]
});
