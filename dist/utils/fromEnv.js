export function fromEnv(name, defaultValue) {
  const value = readEnvValue(name);
  if (value !== undefined) {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw missingVariableError(name);
}
export function numberFromEnv(name, defaultValue) {
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
function readEnvValue(name) {
  const raw = process.env[name];
  if (typeof raw === "string" && raw.length > 0) {
    return raw;
  }
  return undefined;
}
function missingVariableError(name) {
  return new Error(`Environment variable "${name}" is not set and no default was provided.`);
}
//# sourceMappingURL=fromEnv.js.map
