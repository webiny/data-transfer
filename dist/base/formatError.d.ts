/**
 * Turn any thrown value into a human-friendly, single-block string suitable
 * for logger.error. Recognized cases:
 *
 *  - ZodError → per-issue list ("  - source.region: Required").
 *  - Error    → message, plus the full stack when verbose=true.
 *  - anything else → String(value).
 */
export declare function formatError(error: unknown, verbose?: boolean): string;
//# sourceMappingURL=formatError.d.ts.map
