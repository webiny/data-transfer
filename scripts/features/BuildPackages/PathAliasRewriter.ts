import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { PathAliasRewriter as PathAliasRewriterAbstraction } from "./abstractions/PathAliasRewriter.ts";

class PathAliasRewriterImpl implements PathAliasRewriterAbstraction.Interface {
    public rewrite(distDir: string): void {
        this.walk(distDir, distDir);
    }

    private walk(distDir: string, dir: string): void {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                this.walk(distDir, fullPath);
            } else if (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
                this.rewriteFile(distDir, fullPath);
            }
        }
    }

    private rewriteFile(distDir: string, filePath: string): void {
        const content = readFileSync(filePath, "utf-8");
        if (!content.includes("~/")) {
            return;
        }

        const depth = relative(distDir, dirname(filePath)).split(/[\\/]/).filter(Boolean).length;
        const prefix = depth === 0 ? "./" : "../".repeat(depth);
        const rewritten = content.replace(/(["'])~\//g, `$1${prefix}`);
        writeFileSync(filePath, rewritten, "utf-8");
    }
}

export const PathAliasRewriter = PathAliasRewriterAbstraction.createImplementation({
    implementation: PathAliasRewriterImpl,
    dependencies: []
});
