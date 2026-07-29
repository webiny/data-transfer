import { Abstraction } from "@webiny/di";

export interface IArtifactCopier {
    copyPackageJson(packageAbsDir: string, distAbsDir: string): void;
    copyReadme(packageAbsDir: string, distAbsDir: string): void;
    copyLicense(sourceDir: string, distAbsDir: string): void;
    copyAssets(sourceDir: string, distAbsDir: string): void;
}

export const ArtifactCopier = new Abstraction<IArtifactCopier>("Scripts/Build/ArtifactCopier");

export namespace ArtifactCopier {
    export type Interface = IArtifactCopier;
}
