import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";

export async function installDeps(targetDir: string): Promise<void> {
    await ensureYarnAvailable();

    try {
        await execa("corepack", ["enable"], { cwd: targetDir, stdio: "inherit" });
    } catch {
        // corepack may already be enabled or unavailable — yarn itself will work
    }

    const yarnVersion = readYarnVersion(targetDir);
    console.log(`Setting up yarn ${yarnVersion}...`);
    await execa("yarn", ["set", "version", yarnVersion], { cwd: targetDir, stdio: "inherit" });

    try {
        await execa("yarn", ["install"], { cwd: targetDir, stdio: "inherit" });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Dependency installation failed: ${message}\n\n` +
                `You can retry manually:\n` +
                `  cd ${targetDir}\n` +
                `  yarn install\n`
        );
    }
}

function readYarnVersion(targetDir: string): string {
    const pkgPath = join(targetDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const pm = pkg.packageManager as string | undefined;

    if (!pm || !pm.startsWith("yarn@")) {
        throw new Error("packageManager field missing or not yarn in scaffolded package.json");
    }

    return pm.slice("yarn@".length);
}

async function ensureYarnAvailable(): Promise<void> {
    try {
        await execa("yarn", ["--version"], { stdio: "ignore" });
        return;
    } catch {
        // yarn not found directly, try enabling via corepack
    }

    try {
        await execa("corepack", ["enable"], { stdio: "ignore" });
        await execa("yarn", ["--version"], { stdio: "ignore" });
        return;
    } catch {
        // corepack also failed
    }

    throw new Error(
        "Yarn is required but not found.\n\n" +
            "Install it once with one of:\n" +
            "  corepack enable          (recommended, ships with Node)\n" +
            "  npm install -g yarn\n"
    );
}
