# CI Hardening Design

**Date:** 2026-05-08
**Package:** `@webiny/data-transfer`

---

## Goal

Add a complete GitHub Actions CI setup to the repository: code quality checks, coverage-enforced tests, dependency auditing, CodeQL security scanning, and PR title validation. Mirrors the pattern used in `webiny/stdlib`.

---

## Workflows

Four workflow files under `.github/workflows/`:

### 1. `ci.yml`

**Triggers:** `push` to `main` + `pull_request`

**Permissions:** `contents: read`

**Environment:** Node 24, yarn cache enabled, all actions pinned to full SHAs.

**Single sequential job — steps in order:**

1. `yarn install --immutable` — lockfile integrity gate; fails if `yarn.lock` is out of sync
2. `yarn format:check` — oxfmt formatting check
3. `yarn lint` — oxlint with `--deny-warnings`
4. `yarn adio` — import boundary enforcement (already in devDependencies)
5. `yarn ts-check` — `tsc --noEmit`, zero errors required
6. `yarn test:coverage` — vitest run with coverage; fails if coverage drops below thresholds baked into `vitest.config.ts`

### 2. `audit.yml`

**Triggers:** `push` to `main` + `pull_request`

**Identical to `webiny/stdlib` `audit.yml`:**

- **`audit` job:** `yarn npm audit` — scans installed dependencies for known vulnerabilities. Runs on push to main and all PRs.
- **`dependency-review` job:** `actions/dependency-review-action` — compares dependency changes in PRs and surfaces new vulnerabilities. Runs on PRs only. Requires `pull-requests: write` permission.

### 3. `pr-title.yml`

**Triggers:** `pull_request` on types `[opened, edited, synchronize, reopened]`

**Permissions:** `pull-requests: read`

**Identical to `webiny/stdlib` `pr-title.yml`:**

Validates PR titles against conventional commit format using `amannn/action-semantic-pull-request`. Allowed types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `build`, `ci`, `revert`. `requireScope: false`.

### 4. `codeql.yml`

**Triggers:**
- `push` to `main`
- `pull_request`
- `schedule`: weekly, Sunday 02:00 UTC (GitHub's recommendation for scheduled security scans)

**Permissions:** `security-events: write`, `contents: read`, `actions: read`

**Language:** `javascript-typescript` (covers both `.js` and `.ts` source files)

**Steps:** `github/codeql-action/init` → `github/codeql-action/autobuild` → `github/codeql-action/analyze`

---

## Coverage Thresholds (`vitest.config.ts`)

At implementation time, run `yarn test:coverage` to capture current numbers. Add to `vitest.config.ts`:

```typescript
coverage: {
    provider: "v8",
    reporter: ["text", "json", "html"],
    thresholds: {
        lines: <captured>,
        functions: <captured>,
        branches: <captured>,
        statements: <captured>
    }
}
```

`perFile` is not set — thresholds are global (aggregate across all files), not per-file. CI runs `yarn test:coverage`; vitest exits non-zero if any threshold is not met.

---

## Action Pinning

All third-party actions use full commit SHA pins (not semver tags). Pinned SHAs are copied from the stdlib repo for actions that appear there (`actions/checkout`, `actions/setup-node`, `actions/dependency-review-action`, `amannn/action-semantic-pull-request`). The `github/codeql-action` steps are pinned at implementation time by resolving the latest SHA for the v3 tag.

---

## Order of Work

1. Capture coverage baseline — run `yarn test:coverage`, record `lines`/`functions`/`branches`/`statements`.
2. Update `vitest.config.ts` with thresholds. Commit.
3. Create `.github/workflows/ci.yml`. Commit.
4. Create `.github/workflows/audit.yml` (copy from stdlib, adjust if needed). Commit.
5. Create `.github/workflows/pr-title.yml` (copy from stdlib). Commit.
6. Create `.github/workflows/codeql.yml`. Commit.
