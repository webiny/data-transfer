import { MigrationConfiguration } from "./src/config/types.ts";

/**
 * Example Migration Configuration
 *
 * Copy this file to `migration.config.ts` and customize for your migration.
 * The config file supports TypeScript for type safety and autocomplete.
 */
const config: MigrationConfiguration = {
  // ============================================================================
  // Source Account (v5 data) - Account A
  // ============================================================================
  source: {
    region: "us-east-1",

    // Option 1: Use environment variables for credentials (recommended)
    credentials: {
      accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!
      // sessionToken: process.env.SOURCE_AWS_SESSION_TOKEN // Optional for temporary credentials
    },

    // Option 2: Omit credentials to use default AWS credential chain
    // (IAM role, AWS profile, environment variables, etc.)
    // credentials: undefined,

    dynamodb: {
      tableName: "webiny-v5-production"
    },

    s3: {
      bucket: "webiny-v5-files"
    }
  },

  // ============================================================================
  // Target Account (v6 data) - Account B
  // ============================================================================
  target: {
    region: "us-east-1",

    // Credentials for target account
    credentials: {
      accessKeyId: process.env.TARGET_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.TARGET_AWS_SECRET_ACCESS_KEY!
      // sessionToken: process.env.TARGET_AWS_SESSION_TOKEN // Optional
    },

    dynamodb: {
      tableName: "webiny-v6-production"
    },

    s3: {
      bucket: "webiny-v6-files"
    }
  },

  // ============================================================================
  // Migration Settings
  // ============================================================================
  migration: {
    // Built-in presets:
    //   - "v5-to-v6": Webiny v5 to v6 migration with all transformations
    // Or provide path to custom preset file: "./my-custom-preset.ts"
    preset: "v5-to-v6", // REQUIRED - no default value

    // Number of parallel segments for faster processing (optional, default: 1)
    // More segments = faster migration, but more AWS API calls
    segments: 4

    // Optional directory containing CMS model JSON files
    // modelsDir: "./models"
  }
};

export default config;
