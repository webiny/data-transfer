import { existsSync, readFileSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
import { FileTool as FileToolAbstraction } from "./abstractions/FileTool.js";
import { DirectoryTool } from "../DirectoryTool/abstractions/DirectoryTool.js";
import { Logger } from "../Logger/abstractions/Logger.js";
class FileToolImpl {
  logger;
  directoryTool;
  constructor(logger, directoryTool) {
    this.logger = logger;
    this.directoryTool = directoryTool;
  }
  exists(path) {
    return existsSync(path);
  }
  readFile(path) {
    if (!existsSync(path)) {
      this.logger.warn(`File not found: "${path}"`);
      return null;
    }
    return readFileSync(path, "utf-8");
  }
  readFileOrThrow(path) {
    if (!existsSync(path)) {
      throw new Error(`File not found: "${path}"`);
    }
    return readFileSync(path, "utf-8");
  }
  writeFile(path, content) {
    try {
      this.directoryTool.create(dirname(path));
      writeFileSync(path, content, "utf-8");
    } catch (error) {
      this.logger.warn(`Failed to write file "${path}": ${error}`);
    }
  }
  writeFileOrThrow(path, content) {
    this.directoryTool.create(dirname(path));
    writeFileSync(path, content, "utf-8");
  }
  remove(path) {
    rmSync(path, { force: true });
  }
  copy(source, target) {
    if (!existsSync(source)) {
      this.logger.warn(`Source file not found: "${source}"`);
      return;
    }
    this.directoryTool.create(dirname(target));
    copyFileSync(source, target);
  }
  copyOrThrow(source, target) {
    if (!existsSync(source)) {
      throw new Error(`Source file not found: "${source}"`);
    }
    this.directoryTool.create(dirname(target));
    copyFileSync(source, target);
  }
}
export const FileTool = FileToolAbstraction.createImplementation({
  implementation: FileToolImpl,
  dependencies: [Logger, DirectoryTool]
});
//# sourceMappingURL=FileTool.js.map
