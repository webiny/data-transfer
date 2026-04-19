// Duck-typed shapes. We don't import ZodError to avoid pulling zod into every
// consumer; we only read .issues[] when the object looks like a ZodError.

interface ZodIssueLike {
    path: (string | number)[];
    message: string;
}

interface ZodErrorLike {
    name: string;
    issues: ZodIssueLike[];
}

interface ErrorLike {
    name?: string;
    message?: string;
    stack?: string;
}

function isZodErrorLike(value: unknown): value is ZodErrorLike {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value as Partial<ZodErrorLike>;
    return (
        (candidate.name === "ZodError" || candidate.name === "ZodValidationError") &&
        Array.isArray(candidate.issues)
    );
}

function formatZodIssues(error: ZodErrorLike): string {
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
 *  - Error    → message, plus the full stack when DEBUG=1 is set.
 *  - anything else → String(value).
 */
export function formatError(error: unknown): string {
    if (isZodErrorLike(error)) {
        const body = formatZodIssues(error);
        return process.env.DEBUG
            ? `${body}\n\n${(error as unknown as ErrorLike).stack ?? ""}`
            : `${body}\n(Run with DEBUG=1 to see the full stack trace.)`;
    }

    if (error instanceof Error) {
        const message = error.message || error.name || "Unknown error";
        if (process.env.DEBUG && error.stack) {
            return `${message}\n${error.stack}`;
        }
        return `${message}\n(Run with DEBUG=1 to see the full stack trace.)`;
    }

    return String(error);
}
