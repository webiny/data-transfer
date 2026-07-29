export interface IFileTool {
  exists(path: string): boolean;
  readFile(path: string): string | null;
  readFileOrThrow(path: string): string;
  writeFile(path: string, content: string): void;
  writeFileOrThrow(path: string, content: string): void;
  remove(path: string): void;
  copy(source: string, target: string): void;
  copyOrThrow(source: string, target: string): void;
}
export declare const FileTool: import("@webiny/di").Abstraction<IFileTool>;
export declare namespace FileTool {
  type Interface = IFileTool;
}
//# sourceMappingURL=FileTool.d.ts.map
