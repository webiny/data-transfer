import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  cpSync,
  chmodSync,
  accessSync,
  constants
} from "node:fs";
import { dirname } from "node:path";
import { DirectoryTool as DirectoryToolAbstraction } from "./abstractions/DirectoryTool.js";
import { Logger } from "../Logger/abstractions/Logger.js";
class DirectoryToolImpl {
  logger;
  constructor(logger) {
    this.logger = logger;
  }
  exists(path) {
    return existsSync(path);
  }
  create(path) {
    try {
      if (existsSync(path)) {
        try {
          accessSync(path, constants.W_OK);
        } catch {
          chmodSync(path, 0o755);
        }
        return;
      }
      mkdirSync(path, { recursive: true, mode: 0o755 });
    } catch (error) {
      this.logger.warn(`Failed to create directory "${path}": ${error}`);
    }
  }
  readDir(path) {
    if (!existsSync(path)) {
      this.logger.warn(`Directory not found: "${path}"`);
      return null;
    }
    return readdirSync(path);
  }
  readDirOrThrow(path) {
    if (!existsSync(path)) {
      throw new Error(`Directory not found: "${path}"`);
    }
    return readdirSync(path);
  }
  remove(path) {
    rmSync(path, { recursive: true, force: true });
  }
  copy(source, target) {
    if (!existsSync(source)) {
      this.logger.warn(`Source directory not found: "${source}"`);
      return;
    }
    this.create(dirname(target));
    cpSync(source, target, { recursive: true });
  }
  copyOrThrow(source, target) {
    if (!existsSync(source)) {
      throw new Error(`Source directory not found: "${source}"`);
    }
    this.create(dirname(target));
    cpSync(source, target, { recursive: true });
  }
}
export const DirectoryTool = DirectoryToolAbstraction.createImplementation({
  implementation: DirectoryToolImpl,
  dependencies: [Logger]
});
//# sourceMappingURL=DirectoryTool.js.map
