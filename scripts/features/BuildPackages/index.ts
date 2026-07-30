import { Container } from "@webiny/di";
import { ProjectConfig, BuildOrchestrator } from "./abstractions/index.ts";
import { Cleaner as CleanerImpl } from "./Cleaner.ts";
import { Compiler as CompilerImpl } from "./Compiler.ts";
import { ArtifactCopier as ArtifactCopierImpl } from "./ArtifactCopier.ts";
import { BuildOrchestrator as BuildOrchestratorImpl } from "./BuildOrchestrator.ts";
import { PathAliasRewriter as PathAliasRewriterImpl } from "./PathAliasRewriter.ts";

export function run(rootDir: string): void {
  const container = new Container();
  container.registerInstance(ProjectConfig, {
    rootDir,
    slices: ["config/tsconfig.build.json"]
  });
  container.register(CleanerImpl).inSingletonScope();
  container.register(CompilerImpl).inSingletonScope();
  container.register(ArtifactCopierImpl).inSingletonScope();
  container.register(PathAliasRewriterImpl).inSingletonScope();
  container.register(BuildOrchestratorImpl).inSingletonScope();
  container.resolve(BuildOrchestrator).run();
}
