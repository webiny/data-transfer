interface SecurityConfigResult {
    filename: string;
    content: string;
}

const YARNRC = `approvedGitRepositories: []

compressionLevel: mixed

enableGlobalCache: true

enableScripts: false

nodeLinker: node-modules

npmMinimalAgeGate: 3d

npmPreapprovedPackages:
  - "@webiny/*"
`;

export function generateSecurityConfig(): SecurityConfigResult {
    return { filename: ".yarnrc.yml", content: YARNRC };
}
