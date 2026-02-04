// ============================================================================
// Simple Logger
// ============================================================================

export class Logger {
  private context: string;

  constructor(context: string = "migration") {
    this.context = context;
  }

  info(message: string, ...args: any[]) {
    console.log(`[${this.context}] [INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]) {
    console.warn(`[${this.context}] [WARN] ${message}`, ...args);
  }

  error(message: string, ...args: any[]) {
    console.error(`[${this.context}] [ERROR] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]) {
    if (process.env.DEBUG) {
      console.debug(`[${this.context}] [DEBUG] ${message}`, ...args);
    }
  }

  success(message: string, ...args: any[]) {
    console.log(`[${this.context}] [SUCCESS] ${message}`, ...args);
  }
}
