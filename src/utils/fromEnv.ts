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
export function fromEnv(name: string): string;
export function fromEnv(name: string, defaultValue: string): string;
export function fromEnv(name: string, defaultValue?: string): string {
    const value = readEnvValue(name) ?? defaultValue;
    if (value !== undefined) {
        return value;
    }
    throw missingVariableError(name);
}

/**
 * Read a required numeric environment variable with an optional default.
 * Parses via `Number(...)`; throws when the value is set but not
 * parseable (e.g., `SEGMENTS=four`) so typos surface immediately.
 *
 * @example
 *   const segments = numberFromEnv("SEGMENTS", 4);
 *   const port     = numberFromEnv("PORT"); // throws if absent
 */
export function numberFromEnv(name: string): number;
export function numberFromEnv(name: string, defaultValue: number): number;
export function numberFromEnv(name: string, defaultValue?: number): number {
    const raw = readEnvValue(name);
    if (raw === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw missingVariableError(name);
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
        throw new Error(`Environment variable "${name}" is not a valid number (got "${raw}").`);
    }
    return parsed;
}

function readEnvValue(name: string): string | undefined {
    const raw = process.env[name];
    if (typeof raw === "string" && raw.length > 0) {
        return raw;
    }
    return undefined;
}

function missingVariableError(name: string): Error {
    return new Error(`Environment variable "${name}" is not set and no default was provided.`);
}
