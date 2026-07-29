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

export function generateSecurityConfig(): SecurityConfigResult {
    return { filename: ".yarnrc.yml", content: YARNRC };
}
