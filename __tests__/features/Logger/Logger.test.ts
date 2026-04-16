import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PinoLogger } from "../../../src/features/Logger/PinoLogger.ts";

const captureStdout = (): { lines: string[]; restore: () => void } => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
        const str = chunk.toString();
        if (str.trim()) {
            lines.push(str.trim());
        }
        return true;
    });
    return {
        lines,
        restore: () => spy.mockRestore()
    };
};

describe("PinoLogger", () => {
    describe("pretty transport", () => {
        it("creates without throwing", () => {
            expect(() => new PinoLogger({ logLevel: "debug", transport: "pretty" })).not.toThrow();
        });

        it("all methods execute without throwing", () => {
            const logger = new PinoLogger({ logLevel: "debug", transport: "pretty" });
            expect(() => logger.debug("debug msg")).not.toThrow();
            expect(() => logger.info("info msg")).not.toThrow();
            expect(() => logger.warn("warn msg")).not.toThrow();
            expect(() => logger.error("error msg")).not.toThrow();
            expect(() => logger.fatal("fatal msg")).not.toThrow();
            expect(() => logger.done("done msg")).not.toThrow();
        });
    });

    describe("json transport", () => {
        let capture: ReturnType<typeof captureStdout>;

        beforeEach(() => {
            capture = captureStdout();
        });

        afterEach(() => {
            capture.restore();
        });

        const parseLine = (line: string) => JSON.parse(line);

        it("emits info type for info messages", () => {
            const logger = new PinoLogger({ logLevel: "debug", transport: "json" });
            logger.info("hello");
            const entry = parseLine(capture.lines[0]);
            expect(entry.type).toBe("info");
            expect(entry.message).toBe("hello");
        });

        it("emits debug type for debug messages", () => {
            const logger = new PinoLogger({ logLevel: "debug", transport: "json" });
            logger.debug("debug msg");
            const entry = parseLine(capture.lines[0]);
            expect(entry.type).toBe("debug");
            expect(entry.message).toBe("debug msg");
        });

        it("emits warn type for warn messages", () => {
            const logger = new PinoLogger({ logLevel: "debug", transport: "json" });
            logger.warn("warn msg");
            const entry = parseLine(capture.lines[0]);
            expect(entry.type).toBe("warn");
            expect(entry.message).toBe("warn msg");
        });

        it("emits error type for error messages", () => {
            const logger = new PinoLogger({ logLevel: "debug", transport: "json" });
            logger.error("error msg");
            const entry = parseLine(capture.lines[0]);
            expect(entry.type).toBe("error");
            expect(entry.message).toBe("error msg");
        });

        it("emits fatal type for fatal messages", () => {
            const logger = new PinoLogger({ logLevel: "debug", transport: "json" });
            logger.fatal("fatal msg");
            const entry = parseLine(capture.lines[0]);
            expect(entry.type).toBe("fatal");
            expect(entry.message).toBe("fatal msg");
        });

        it("emits done type for done messages", () => {
            const logger = new PinoLogger({ logLevel: "debug", transport: "json" });
            logger.done("done msg");
            const entry = parseLine(capture.lines[0]);
            expect(entry.type).toBe("done");
            expect(entry.message).toBe("done msg");
        });

        it("done emits plain info on pretty transport", () => {
            capture.restore();
            const logger = new PinoLogger({ logLevel: "debug", transport: "pretty" });
            expect(() => logger.done("finished")).not.toThrow();
        });

        it("respects log level — does not emit debug at error level", () => {
            const logger = new PinoLogger({ logLevel: "error", transport: "json" });
            logger.debug("should not appear");
            logger.info("should not appear");
            logger.warn("should not appear");
            expect(capture.lines).toHaveLength(0);
        });

        it("emits error and above at error level", () => {
            const logger = new PinoLogger({ logLevel: "error", transport: "json" });
            logger.error("visible");
            logger.fatal("also visible");
            expect(capture.lines).toHaveLength(2);
            expect(parseLine(capture.lines[0]).type).toBe("error");
            expect(parseLine(capture.lines[1]).type).toBe("fatal");
        });
    });
});
