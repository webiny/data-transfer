import { execa } from "execa";
import type { PackageManager } from "../types.ts";

export async function installDeps(targetDir: string, pm: PackageManager): Promise<void> {
    if (pm === "yarn") {
        try {
            await execa("corepack", ["enable"], { cwd: targetDir, stdio: "inherit" });
        } catch {
            console.warn("Warning: corepack enable failed. Continuing with yarn install...");
        }
    }

    try {
        await execa(pm, ["install"], { cwd: targetDir, stdio: "inherit" });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Dependency installation failed: ${message}\n\n` +
                `You can retry manually:\n` +
                `  cd ${targetDir}\n` +
                `  ${pm} install\n`
        );
    }
}
