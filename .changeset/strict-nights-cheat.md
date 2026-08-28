---
"@webiny/data-transfer": patch
---

Fix cross-account migration by bypassing `@webiny/aws-sdk` client cache. Add `--config`, `--preset`, and `--dry-run` flags to skip the wizard. Wire `copyFileToTarget` in `copy-files` and `v5-to-v6-ddb` presets so S3 files are actually copied. URL-encode `CopySource` path segments for keys with special characters. Fix flaky dynalite integration test with `waitForTableActive`.
