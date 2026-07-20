import type { PackageManager } from "../types.ts";

interface SecurityConfigResult {
    filename: string;
    content: string;
}

const YARNRC = `enableScripts: false

npmMinimalAgeGate: 3d

npmPreapprovedPackages:
  - "@webiny/*"

nodeLinker: node-modules
`;

const NPMRC = `audit-level=high
ignore-scripts=true
`;

export function generateSecurityConfig(pm: PackageManager): SecurityConfigResult {
    if (pm === "yarn") {
        return { filename: ".yarnrc.yml", content: YARNRC };
    }
    return { filename: ".npmrc", content: NPMRC };
}
