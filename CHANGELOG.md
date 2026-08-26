# @webiny/data-transfer

## 0.0.3

### Patch Changes

- 3a09d52: Strip revision suffixes (`#NNNN`) from `inheritedFrom` in FLP permission records during transfer. Pin `@changesets/cli` to 2.x to fix publishing.

## 0.0.2

### Patch Changes

- 2acdc84: Strip `#0001` revision suffix from `inheritedFrom` in FLP permission records during transfer.

## 0.0.1

### Patch Changes

- 534dfc3: initial release

## 0.0.1-alpha.3

### Patch Changes

- fa34265: Add `update-skills` CLI command for updating Claude Code skills from the installed package. Ship `.gitignore` in scaffolded projects (npm strips dotfiles, so we ship as `.gitignore.example` and rename during scaffold).

## 0.0.1-alpha.2

### Patch Changes

- 3cab748: Add MCP server (`webiny-data-transfer-mcp`) with `list_topics` and `get_topic` tools serving 44 documentation topics. Export all 27 built-in transformers and all 18 filter predicates as public API. Consolidate CI workflows and update all GitHub Actions to latest versions.

## 0.0.1-alpha.1

### Patch Changes

- 24a502a: Consolidate CI workflows, update all GitHub Actions to latest versions, add register callback example to scaffolded config template, fix scaffold yarn install in CI environments.

## 0.0.1-alpha.0

### Patch Changes

- Initial alpha release of the standalone data-transfer package. Includes CLI with guided wizard, DynamoDB/OpenSearch/S3 transfer support, built-in presets (v5-to-v6, copy), pipeline framework with customizable transformers and filters, and project scaffolding via `npx @webiny/data-transfer`.
