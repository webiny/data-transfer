import { execa } from "execa";

export async function installDeps(targetDir: string): Promise<void> {
    await ensureYarnAvailable();

    try {
        await execa("corepack", ["enable"], { cwd: targetDir, stdio: "inherit" });
    } catch {
        // corepack may already be enabled or unavailable — yarn itself will work
    }

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
