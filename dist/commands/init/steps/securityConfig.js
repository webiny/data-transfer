const YARNRC = `enableScripts: false

npmMinimalAgeGate: 3d

npmPreapprovedPackages:
  - "@webiny/*"

nodeLinker: node-modules
`;
const NPMRC = `audit-level=high
ignore-scripts=true
`;
export function generateSecurityConfig(pm) {
  if (pm === "yarn") {
    return { filename: ".yarnrc.yml", content: YARNRC };
  }
  return { filename: ".npmrc", content: NPMRC };
}
//# sourceMappingURL=securityConfig.js.map
