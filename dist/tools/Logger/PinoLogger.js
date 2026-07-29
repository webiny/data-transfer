import pino, { multistream } from "pino";
import pretty from "pino-pretty";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Writable } from "node:stream";
const LEVEL_TO_TYPE = {
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal"
};
const createJsonDestination = () => {
  return new Writable({
    write(chunk, _enc, cb) {
      try {
        const entry = JSON.parse(chunk.toString());
        const type = entry._done ? "done" : (LEVEL_TO_TYPE[entry.level] ?? "info");
        process.stdout.write(JSON.stringify({ type, message: entry.msg }) + "\n");
      } catch {
        // ignore malformed lines
      }
      cb();
    }
  });
};
const createPrettyDestination = () => {
  return pretty({
    colorize: true,
    customColors: "fatal:red,error:red,warn:yellow,info:blue,debug:gray",
    ignore: "pid,hostname,time",
    messageFormat: "{msg}"
  });
};
const createFileDestination = path => {
  mkdirSync(dirname(path), { recursive: true });
  return pino.destination({ dest: path, append: true, periodicFlush: 5000 });
};
export class PinoLogger {
  logger;
  transport;
  logFile;
  prefix;
  constructor(params) {
    this.transport = params.transport;
    this.logFile = params.logFile;
    this.prefix = params.prefix ?? "";
    if (params.pinoLogger) {
      this.logger = params.pinoLogger;
      return;
    }
    const consoleStream =
      this.transport === "json" ? createJsonDestination() : createPrettyDestination();
    // Single-stream fast path when there's no log file. Pino routes
    // writes directly to the destination without the multistream
    // wrapper — preserves the synchronous stdout.write semantics the
    // existing JSON-transport tests rely on.
    if (!this.logFile) {
      this.logger = pino({ level: params.logLevel }, consoleStream);
      return;
    }
    // Fan-out: console + raw pino JSONL to file. File content is
    // machine-readable; post-hoc `pino-pretty < file.log` for humans.
    // Explicit level on each stream — multistream defaults to DEFAULT_INFO_LEVEL
    // (30) when level is omitted, which silently drops sub-info messages.
    const streams = [
      { stream: consoleStream, level: params.logLevel },
      { stream: createFileDestination(this.logFile), level: params.logLevel }
    ];
    this.logger = pino({ level: params.logLevel }, multistream(streams));
  }
  debug(message, ...args) {
    this.logger.debug(this.prefix + message, ...args);
  }
  info(message, ...args) {
    this.logger.info(this.prefix + message, ...args);
  }
  warn(message, ...args) {
    this.logger.warn(this.prefix + message, ...args);
  }
  error(message, ...args) {
    this.logger.error(this.prefix + message, ...args);
  }
  fatal(message, ...args) {
    this.logger.fatal(this.prefix + message, ...args);
  }
  done(message) {
    const prefixed = this.prefix + message;
    if (this.transport === "json") {
      this.logger.info({ _done: true }, prefixed);
      return;
    }
    this.logger.info(prefixed);
  }
  child(prefix) {
    return new PinoLogger({
      logLevel: this.logger.level,
      transport: this.transport,
      logFile: this.logFile,
      prefix: this.prefix + prefix,
      pinoLogger: this.logger
    });
  }
}
//# sourceMappingURL=PinoLogger.js.map
