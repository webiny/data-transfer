// Duck-typed shapes. We don't import ZodError to avoid pulling zod into every
// consumer; we only read .issues[] when the object looks like a ZodError.
function isZodErrorLike(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return (
    (candidate.name === "ZodError" || candidate.name === "ZodValidationError") &&
    Array.isArray(candidate.issues)
  );
}
function formatZodIssues(error) {
  if (error.issues.length === 0) {
    return "Validation failed (no details).";
  }
  const lines = error.issues.map(issue => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `  - ${path}: ${issue.message}`;
  });
  return ["Config validation failed:", ...lines].join("\n");
}
/**
 * Turn any thrown value into a human-friendly, single-block string suitable
 * for logger.error. Recognized cases:
 *
 *  - ZodError → per-issue list ("  - source.region: Required").
 *  - Error    → message, plus the full stack when verbose=true.
 *  - anything else → String(value).
 */
export function formatError(error, verbose = false) {
  if (isZodErrorLike(error)) {
    const body = formatZodIssues(error);
    return verbose
      ? `${body}\n\n${error.stack ?? ""}`
      : `${body}\n(Set logLevel: "debug" to see the full stack trace.)`;
  }
  if (error instanceof Error) {
    const message = error.message || error.name || "Unknown error";
    if (verbose && error.stack) {
      return `${message}\n${error.stack}`;
    }
    return `${message}\n(Set logLevel: "debug" to see the full stack trace.)`;
  }
  return String(error);
}
//# sourceMappingURL=formatError.js.map
