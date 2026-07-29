/**
 * Read a required string environment variable with an optional default.
 *
 * - If `process.env[name]` is a non-empty string, return it.
 * - Else if `defaultValue` is provided, return it.
 * - Else throw, naming the missing variable — fail fast, no silent
 *   coercion to `undefined`.
 *
 * Empty strings count as "not set" because `KEY=` in a `.env` file is
 * almost always a forgotten value, not an intentional empty override.
 *
 * @example
 *   const region = fromEnv("SOURCE_REGION", "eu-central-1");
 *   const table  = fromEnv("SOURCE_DDB_TABLE"); // throws if absent
 */
export declare function fromEnv(name: string): string;
export declare function fromEnv(name: string, defaultValue: string): string;
export declare function fromEnv(name: string, defaultValue: null): string | null;
/**
 * Read a required numeric environment variable with an optional default.
 * Parses via `Number(...)`; throws when the value is set but not
 * parseable (e.g., `SEGMENTS=four`) so typos surface immediately.
 *
 * @example
 *   const segments = numberFromEnv("SEGMENTS", 4);
 *   const port     = numberFromEnv("PORT"); // throws if absent
 */
export declare function numberFromEnv(name: string): number;
export declare function numberFromEnv(name: string, defaultValue: number): number;
//# sourceMappingURL=fromEnv.d.ts.map
