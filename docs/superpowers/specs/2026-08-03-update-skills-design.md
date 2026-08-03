# Update Skills Command

## Problem

Skills ship in `templates/.claude/skills/` and get copied into user projects at `init` time. After that, no update path exists — users stay on whatever skill version they scaffolded with.

## Solution

New CLI command: `webiny-data-transfer update-skills`

Exposed in scaffolded projects as `yarn update-skills`.

## Behavior

1. Resolve package root via `findPackageRoot` (same as `init` command).
2. Source: `{packageRoot}/templates/.claude/skills/`.
3. Target: `{cwd}/.claude/skills/`.
4. Create target directory if missing.
5. Read source skill directories, `cpSync` each into target (recursive, overwrite).
6. Print which skills were copied.
7. Error if source templates directory is missing (corrupted package).

## Design decisions

- **Overwrite always.** Skills are ours, not user-customizable. No diff, no skip, no prompt.
- **No cleanup of removed skills.** Only copies what we ship. Old skills user may have from previous versions stay. Avoids accidental deletion of user-added skills.
- **No version tracking.** Simplest possible implementation. If we need smarter behavior later, we add it then.

## Files

| File | Change |
|------|--------|
| `src/commands/updateSkills/handler.ts` | New — command logic |
| `src/commands/updateSkills/register.ts` | New — yargs registration |
| `src/commands/index.ts` | Export `registerUpdateSkillsCommand` |
| `src/cli.ts` | Register command, add to `KNOWN_COMMANDS` |
| `src/commands/init/steps/generatePackageJson.ts` | Add `update-skills` script |
