# Session Handoff — 2026-07-30 — Installable Package Polish

## What was done

- **Verdaccio local publish** — `.verdaccio.yaml` with explicit listen port, `releaseVerdaccio.ts` script that reads URL from yaml, checks npm registry matches exactly, builds, publishes with `local-npm` tag. `verdaccio:start` and `release:verdaccio` package.json scripts.
- **Scaffolded project auto-detects verdaccio** — when installed version contains `local-npm`, appends `npmRegistryServer` and `unsafeHttpWhitelist` to `.yarnrc.yml` before `yarn install`.
- **Always yarn** — removed package manager prompt, scaffolded projects always use yarn with `packageManager` field. `installDeps` checks yarn availability, runs `yarn set version` to bootstrap yarn binary into `.yarn/releases/`.
- **CLI default command** — `npx @webiny/data-transfer my-folder` works (unknown first arg → init).
- **Slugify project names** — spaces and special chars converted to hyphens. Applied in init handler and wizard.
- **Template simplification** — removed `internal-project/`, old `projects/` from templates. Clean boilerplate: `projects/example/` (config + .env), `presets/` (copy-ddb/copy-os/copy-files/example), `transformers/` (stampMigratedAt), `models/`.
- **Multi-project structure restored** — `projects/` directory with per-environment configs, wizard discovers them.
- **Dependencies for users** — `typescript`, `tsx`, `@types/node` moved to `dependencies` so users get them transitively. `tsx` registered at CLI startup for user `.ts` file imports.
- **init-project fixed** — points at `templates/projects/example` after `internal-project/` removal.
- **tsconfig fix** — restored `module`/`moduleResolution`/`paths` in root tsconfig (tsx couldn't resolve `~/foo.js` without nodenext).
- **CI scaffold smoke test** — new job: starts verdaccio, publishes, scaffolds project via npx, verifies structure, typechecks, tests CLI --help.
- **User-facing docs** — expanded `pipeline-runtime.md` and `troubleshooting.md`. Added doc maintenance rule to AGENTS.md (section 6). User README links to GitHub docs. `IndexConfigurationProvider` usage example in config-reference.
- **Scaffolded .yarnrc.yml** aligned with project security config.
- 66 commits, 110 test files, 715 tests

## Key decisions

- `typescript`, `tsx`, `@types/node` are runtime dependencies (in `dependencies` key) — user projects need them to typecheck and run .ts configs
- `~/` imports use `.js` extension, relative imports use `.ts` — stdlib convention
- User projects always use yarn — no package manager choice
- `projects/` configs in dev repo use `~/index.js` (repo alias), templates use `@webiny/data-transfer` (npm package)
- Transitive dep cleanup (react/apollo/admin-ui) deferred to webiny-js monorepo
- Doc maintenance is mandatory — AGENTS.md section 6 enforces updates with behavior changes

## Current state

- Branch: `bruno/feat/installable-package`
- Tests: 715 passed (110 files)
- Typecheck: passing
- Build: clean
- adio: flags `@types/node` as unused (needs `.adiorc.js` ignore — user will add)
- Unpushed commits: 66

## What might come next

1. Add `.adiorc.js` to ignore `@types/node` in adio check
2. First real npm publish — `NPM_TOKEN` secret, `yarn changeset`, merge to main
3. Fix webiny-js transitive dep tree (remove frontend deps from backend packages)
4. End-to-end AWS smoke test
5. Version strategy: 0.x vs 1.x for initial publish
