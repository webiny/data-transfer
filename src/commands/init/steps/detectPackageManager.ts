import type { PackageManager } from "../types.ts";

export function detectPackageManager(): PackageManager {
    const agent = process.env["npm_config_user_agent"] ?? "";

    if (agent.startsWith("yarn")) {
        return "yarn";
    }
    if (agent.startsWith("pnpm")) {
        return "pnpm";
    }
    return "npm";
}
