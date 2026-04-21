/**
 * Read a required environment variable with an optional default.
 *
 * - If `process.env[name]` is set to a non-empty string, return it.
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
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) {
        return value;
    }
    if (defaultValue !== undefined) {
        return defaultValue;
    }
    throw new Error(`Environment variable "${name}" is not set and no default was provided.`);
}
