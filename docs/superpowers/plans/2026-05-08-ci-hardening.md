# CI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete GitHub Actions CI setup — code quality, coverage-enforced tests, dependency auditing, CodeQL scanning, and PR title validation.

**Architecture:** Four focused workflow files (`ci.yml`, `audit.yml`, `pr-title.yml`, `codeql.yml`) plus a `check:imports` npm script and baked-in vitest coverage thresholds. All third-party action SHAs are pinned. Mirrors the `webiny/stdlib` pattern.

**Tech Stack:** GitHub Actions, Vitest v8 coverage, adio, oxfmt, oxlint, CodeQL v3.35.4

---

## Files

| Action | Path |
|---|---|
| Modify | `package.json` |
| Modify | `vitest.config.ts` |
| Create | `.github/workflows/ci.yml` |
| Create | `.github/workflows/audit.yml` |
| Create | `.github/workflows/pr-title.yml` |
| Create | `.github/workflows/codeql.yml` |

---

## Task 1: Add `check:imports` script to package.json

**Files:** Modify `package.json`

- [ ] **Step 1: Add the script**

  In `package.json`, add `"check:imports": "adio"` to the `scripts` block (after `lint:fix`):

  ```json
  "lint:fix": "oxlint --fix",
  "check:imports": "adio"
  ```

- [ ] **Step 2: Verify it runs without error**

  ```bash
  yarn check:imports
  ```

  Expected: exits 0. If adio reports violations, fix them before continuing (they'd block CI).

- [ ] **Step 3: Commit**

  ```bash
  git add package.json
  git commit -m "chore: add check:imports script (adio)"
  ```

---

## Task 2: Add coverage thresholds to vitest.config.ts

**Files:** Modify `vitest.config.ts`

Baseline captured from the current suite (`yarn test:coverage`):
- Statements: **77.09%** → threshold: **77**
- Branches: **70.21%** → threshold: **70**
- Functions: **80.86%** → threshold: **80**
- Lines: **77.16%** → threshold: **77**

- [ ] **Step 1: Add thresholds to the coverage block**

  Replace the existing `coverage` block in `vitest.config.ts`:

  ```typescript
  coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
          lines: 77,
          functions: 80,
          branches: 70,
          statements: 77
      }
  }
  ```

- [ ] **Step 2: Verify the suite still passes with thresholds**

  ```bash
  yarn test:coverage
  ```

  Expected: all tests pass, coverage summary shows all four metrics above their thresholds, exits 0.

- [ ] **Step 3: Commit**

  ```bash
  git add vitest.config.ts
  git commit -m "chore: add coverage thresholds to vitest config"
  ```

---

## Task 3: Create `.github/workflows/ci.yml`

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1: Create the directory and file**

  ```bash
  mkdir -p .github/workflows
  ```

  Create `.github/workflows/ci.yml` with this exact content:

  ```yaml
  name: CI

  on:
    push:
      branches: [main]
    pull_request:

  permissions:
    contents: read

  jobs:
    ci:
      name: CI
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
        - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
          with:
            node-version: 24
            cache: yarn
        - run: yarn install --immutable
        - run: yarn format:check
        - run: yarn lint
        - run: yarn check:imports
        - run: yarn ts-check
        - run: yarn test:coverage
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "ci: add CI workflow"
  ```

---

## Task 4: Create `.github/workflows/audit.yml`

**Files:** Create `.github/workflows/audit.yml`

- [ ] **Step 1: Create the file**

  Create `.github/workflows/audit.yml` with this exact content (identical to `webiny/stdlib`):

  ```yaml
  name: Audit

  on:
    push:
      branches: [main]
    pull_request:

  permissions:
    contents: read

  jobs:
    audit:
      name: Dependency audit
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
        - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
          with:
            node-version: 24
            cache: yarn
        - run: yarn install --immutable
        - run: yarn npm audit

    dependency-review:
      name: Dependency review
      runs-on: ubuntu-latest
      if: github.event_name == 'pull_request'
      permissions:
        contents: read
        pull-requests: write
      steps:
        - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
        - uses: actions/dependency-review-action@2031cfc080254a8a887f58cffee85186f0e49e48 # v4.9.0
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add .github/workflows/audit.yml
  git commit -m "ci: add dependency audit workflow"
  ```

---

## Task 5: Create `.github/workflows/pr-title.yml`

**Files:** Create `.github/workflows/pr-title.yml`

- [ ] **Step 1: Create the file**

  Create `.github/workflows/pr-title.yml` with this exact content (identical to `webiny/stdlib`):

  ```yaml
  name: PR Title

  on:
    pull_request:
      types: [opened, edited, synchronize, reopened]

  permissions:
    pull-requests: read

  jobs:
    title-lint:
      name: Conventional commit title
      runs-on: ubuntu-latest
      steps:
        - uses: amannn/action-semantic-pull-request@e32d7e603df1aa1ba07e981f2a23455dee596825 # v5
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          with:
            types: |
              feat
              fix
              refactor
              test
              chore
              docs
              style
              perf
              build
              ci
              revert
            requireScope: false
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add .github/workflows/pr-title.yml
  git commit -m "ci: add PR title validation workflow"
  ```

---

## Task 6: Create `.github/workflows/codeql.yml`

**Files:** Create `.github/workflows/codeql.yml`

Uses `github/codeql-action` pinned to `7fd177fa680c9881b53cdab4d346d32574c9f7f4` (v3.35.4, released 2026-05-08 — the latest at time of writing). Weekly schedule on Sunday 02:00 UTC per GitHub's recommendation for scheduled scans.

- [ ] **Step 1: Create the file**

  Create `.github/workflows/codeql.yml` with this exact content:

  ```yaml
  name: CodeQL

  on:
    push:
      branches: [main]
    pull_request:
    schedule:
      - cron: '0 2 * * 0'

  permissions:
    contents: read
    security-events: write
    actions: read

  jobs:
    analyze:
      name: Analyze (javascript-typescript)
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
        - name: Initialize CodeQL
          uses: github/codeql-action/init@7fd177fa680c9881b53cdab4d346d32574c9f7f4 # v3.35.4
          with:
            languages: javascript-typescript
        - name: Autobuild
          uses: github/codeql-action/autobuild@7fd177fa680c9881b53cdab4d346d32574c9f7f4 # v3.35.4
        - name: Analyze
          uses: github/codeql-action/analyze@7fd177fa680c9881b53cdab4d346d32574c9f7f4 # v3.35.4
          with:
            category: "/language:javascript-typescript"
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add .github/workflows/codeql.yml
  git commit -m "ci: add CodeQL security scanning workflow"
  ```

---

## Final verification

- [ ] Run `yarn format:fix && yarn ts-check && yarn test` — expect all green.
- [ ] Run `git status` — no uncommitted changes.
- [ ] Check `.github/workflows/` contains exactly four files: `ci.yml`, `audit.yml`, `pr-title.yml`, `codeql.yml`.
