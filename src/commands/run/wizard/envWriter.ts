import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnvValues } from "./types.ts";

const TOKEN_MAP: Record<string, keyof EnvValues> = {
    SOURCE_REGION: "sourceRegion",
    SOURCE_DDB_TABLE: "sourceDdbTable",
    SOURCE_S3_BUCKET: "sourceS3Bucket",
    SOURCE_OS_TABLE: "sourceOsTable",
    TARGET_REGION: "targetRegion",
    TARGET_DDB_TABLE: "targetDdbTable",
    TARGET_S3_BUCKET: "targetS3Bucket",
    TARGET_OS_TABLE: "targetOsTable",
    TARGET_OS_ENDPOINT: "targetOsEndpoint",
    TARGET_OS_INDEX_PREFIX: "targetOsIndexPrefix",
    SEGMENTS: "segments"
};

const BUILT_IN_TEMPLATE = `# Copy this file to \`.env\` next to it. \`.env*\` is gitignored.
#
# The configs accept AWS credentials in TWO shapes — pick one per account.
#
# A) Profile-based (default in the configs): set *_PROFILE and point at
#    ~/.aws/credentials. Leave blank to use the \`default\` profile.
# B) Literal credentials via env vars: uncomment the literal block in
#    the config file and fill in the *_AWS_ACCESS_KEY_ID /
#    *_AWS_SECRET_ACCESS_KEY vars below. *_AWS_SESSION_TOKEN is only
#    needed for temporary STS credentials.

# --- Source environment ------------------------------------------------
SOURCE_REGION={{SOURCE_REGION}}

# Option A: profile name (reads ~/.aws/credentials)
# SOURCE_PROFILE=my-source-profile

# Option B: literal credentials (uncomment + fill in)
# SOURCE_AWS_ACCESS_KEY_ID=
# SOURCE_AWS_SECRET_ACCESS_KEY=
# SOURCE_AWS_SESSION_TOKEN=

SOURCE_DDB_TABLE={{SOURCE_DDB_TABLE}}
SOURCE_S3_BUCKET={{SOURCE_S3_BUCKET}}
SOURCE_OS_TABLE={{SOURCE_OS_TABLE}}

# --- Target environment ------------------------------------------------
TARGET_REGION={{TARGET_REGION}}

# TARGET_PROFILE=my-target-profile

# TARGET_AWS_ACCESS_KEY_ID=
# TARGET_AWS_SECRET_ACCESS_KEY=
# TARGET_AWS_SESSION_TOKEN=

TARGET_DDB_TABLE={{TARGET_DDB_TABLE}}
TARGET_S3_BUCKET={{TARGET_S3_BUCKET}}
TARGET_OS_TABLE={{TARGET_OS_TABLE}}
TARGET_OS_ENDPOINT={{TARGET_OS_ENDPOINT}}
TARGET_OS_INDEX_PREFIX={{TARGET_OS_INDEX_PREFIX}}

# --- Tuning ------------------------------------------------------------------
# Number of parallel worker processes (DDB parallel-scan segments).
SEGMENTS={{SEGMENTS}}
`;

function substituteTokens(template: string, values: EnvValues): string {
    let result = template;
    for (const [token, key] of Object.entries(TOKEN_MAP)) {
        result = result.replaceAll(`{{${token}}}`, String(values[key]));
    }
    return result;
}

export async function writeEnv(projectDir: string, values: EnvValues): Promise<void> {
    let template = BUILT_IN_TEMPLATE;

    const examplePath = join(projectDir, ".env.example");
    try {
        const candidate = await readFile(examplePath, "utf8");
        if (!candidate.includes("{{")) {
            throw new Error(
                `.env.example at ${examplePath} contains no {{TOKEN}} placeholders. ` +
                    `Add placeholders or remove the file to use the built-in template.`
            );
        }
        template = candidate;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            // no .env.example — use built-in
        } else {
            throw err;
        }
    }

    const content = substituteTokens(template, values);
    await writeFile(join(projectDir, ".env"), content, "utf8");
}
