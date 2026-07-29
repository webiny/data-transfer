export interface IDirectoryTool {
  exists(path: string): boolean;
  create(path: string): void;
  readDir(path: string): string[] | null;
  readDirOrThrow(path: string): string[];
  remove(path: string): void;
  copy(source: string, target: string): void;
  copyOrThrow(source: string, target: string): void;
}
export declare const DirectoryTool: import("@webiny/di").Abstraction<IDirectoryTool>;
export declare namespace DirectoryTool {
  type Interface = IDirectoryTool;
}
//# sourceMappingURL=DirectoryTool.d.ts.map
